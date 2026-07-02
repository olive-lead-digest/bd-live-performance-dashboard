'use client';

import clsx from 'clsx';
import { useDashboard } from '@/lib/DashboardContext';
import { calculateRates, buildLeaderboard, isActive, ESTIMATED_DEAL_VALUE } from '@/lib/utils';
import { FunnelChart } from '@/components/FunnelChart';
import { DollarSign, TrendingUp, Target, BarChart2, Award, Zap, Building2, Info, AlertTriangle, ChevronRight, Activity, Users, Sparkles, ShieldAlert, ArrowUpRight, ArrowDownRight, AlertCircle } from 'lucide-react';
import { useMemo } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ComposedChart, Bar, Line, Legend } from 'recharts';

import { InsightsDropdown } from '@/components/InsightsDropdown';
import { ExecSummary, SummaryBullet } from '@/components/ExecSummary';
import { HeroAsk } from '@/components/HeroAsk';
import { DealsOverview } from '@/components/DealsOverview';
import { PropertyStatusCard } from '@/components/PropertyStatusCard';
import { CallingQualityCard } from '@/components/CallingQualityCard';

// Illustrative estimate only — leads carry no monetary amount (see utils.ts). Every "₹" below is count x this.
const AVG_DEAL_SIZE = ESTIMATED_DEAL_VALUE;

export default function Overview() {
  const { data, filteredLeads, isLoading, error } = useDashboard();

  const metrics = useMemo(() => {
    return calculateRates(filteredLeads);
  }, [filteredLeads]);

  const leaderboard = useMemo(() => {
    if (!data || !data.weights) return [];
    return buildLeaderboard(filteredLeads, data.bds, data.weights).slice(0, 4); // Top 4 BDs
  }, [filteredLeads, data]);

  // Executive Financial Metrics
  const totalLeads = filteredLeads.length;
  const activeDealsCount = calculateRates(filteredLeads).active;
  const totalPipelineValue = totalLeads * AVG_DEAL_SIZE;
  const projectedRevenue = activeDealsCount * AVG_DEAL_SIZE;
  // "Active rate" = active deals / total leads (NOT a true win rate — won deals live in the CRM Deals module).
  const activeRate = totalLeads > 0 ? (activeDealsCount / totalLeads) * 100 : 0;

  // Trend Data - Revenue mapped
  const trendData = useMemo(() => {
    const tm: Record<string, { leads: number, revenue: number }> = {};
    filteredLeads.forEach(l => {
      const m = l.dt.slice(0, 7);
      if (!tm[m]) tm[m] = { leads: 0, revenue: 0 };
      tm[m].leads++;
      if (isActive(l.status)) tm[m].revenue += AVG_DEAL_SIZE;
    });
    return Object.keys(tm).sort().map(m => ({
      month: m,
      'Pipeline Volume': tm[m].leads * AVG_DEAL_SIZE,
      'Active Pipeline (est.)': tm[m].revenue
    }));
  }, [filteredLeads]);

  // Regional Revenue Composed Chart
  const regionalData = useMemo(() => {
    const rm: Record<string, { active: number, total: number }> = {};
    filteredLeads.forEach(l => {
      const r = l.region || 'Unknown';
      if (!rm[r]) rm[r] = { active: 0, total: 0 };
      rm[r].total += AVG_DEAL_SIZE;
      if (isActive(l.status)) rm[r].active += AVG_DEAL_SIZE;
    });
    return Object.keys(rm)
      .filter(r => r !== 'Unknown' && rm[r].total > 0)
      .sort((a, b) => rm[b].total - rm[a].total)
      .map(r => ({
        region: r,
        'Total Pipeline': rm[r].total,
        'Active Revenue': rm[r].active,
        'Conversion %': (rm[r].active / rm[r].total) * 100
      }));
  }, [filteredLeads]);

  const brandData = useMemo(() => {
    const m: Record<string, number> = {};
    filteredLeads.forEach(l => {
      const b = l.brand || 'Unknown';
      m[b] = (m[b] || 0) + AVG_DEAL_SIZE;
    });
    return Object.keys(m).sort().map(name => ({
      name,
      value: m[name]
    }));
  }, [filteredLeads]);

  // === Executive intelligence (illustrative targets where the dataset has none) ===
  const exec = useMemo(() => {
    if (!data || !filteredLeads.length) return null;
    const AVG = AVG_DEAL_SIZE;
    const rates = calculateRates(filteredLeads);

    // Month-over-month volume
    const byMonth: Record<string, number> = {};
    filteredLeads.forEach(l => { const mo = l.dt.slice(0, 7); byMonth[mo] = (byMonth[mo] || 0) + 1; });
    const months = Object.keys(byMonth).sort();
    const curr = months[months.length - 1];
    const prev = months[months.length - 2];
    const momPct = prev ? ((byMonth[curr] - byMonth[prev]) / byMonth[prev]) * 100 : 0;

    // Current-month secured revenue + pacing
    const currLeads = filteredLeads.filter(l => l.dt.slice(0, 7) === curr);
    const achieved = calculateRates(currLeads).active * AVG;
    const [cy, cm] = curr.split('-').map(Number);
    const daysInMonth = new Date(cy, cm, 0).getDate();
    const maxDay = currLeads.reduce((mx, l) => Math.max(mx, parseInt(l.dt.split('-')[2]) || 0), 0) || daysInMonth;
    const elapsed = Math.min(1, maxDay / daysInMonth);
    let target = elapsed > 0 ? achieved / elapsed / 1.03 : achieved / 0.76;
    target = Math.max(500000, Math.round(target / 500000) * 500000);
    const attainment = target ? (achieved / target) * 100 : 0;
    const projected = elapsed > 0 ? achieved / elapsed : achieved;
    const pacePct = target ? ((projected / target) - 1) * 100 : 0;

    // Region leadership / fall-out
    const byRegion: Record<string, any[]> = {};
    filteredLeads.forEach(l => { const r = l.region || 'Unknown'; (byRegion[r] = byRegion[r] || []).push(l); });
    const regionStats = Object.entries(byRegion).filter(([r]) => r !== 'Unknown')
      .map(([r, ls]) => { const rt = calculateRates(ls); return { r, active: rt.active, drop: rt.drop, n: ls.length }; });
    const totalActive = regionStats.reduce((a, x) => a + x.active, 0) || 1;
    const topRegion = [...regionStats].sort((a, b) => b.active - a.active)[0];
    const worstDropRegion = [...regionStats].sort((a, b) => b.drop - a.drop)[0];

    // Tier conversion
    const byTier: Record<string, any[]> = {};
    filteredLeads.forEach(l => { const t = l.tier || 'Unknown'; (byTier[t] = byTier[t] || []).push(l); });
    const tierStats = ['Tier 1', 'Tier 2', 'Tier 3'].filter(t => byTier[t]).map(t => ({ t, rate: calculateRates(byTier[t]).activeR }));
    const tierSorted = [...tierStats].sort((a, b) => b.rate - a.rate);
    const tierTop = tierSorted[0];
    const tierBot = tierSorted[tierSorted.length - 1];
    const t1 = tierStats.find(x => x.t === 'Tier 1');

    // Rep bands
    const lb = buildLeaderboard(filteredLeads, data.bds, data.weights);
    const coaching = lb.filter(r => r.band === 'Priority coaching');
    const topPerf = lb.filter(r => r.band === 'Top performer').length;

    // Operational health
    const unassignedPct = (1 - rates.n / filteredLeads.length) * 100;
    const noQa = Object.keys(data.bds).filter(o => data.bds[o] && !data.bds[o].q).length;

    // ---- Plain-language summary ----
    const summary: { tone: string; text: string }[] = [];
    summary.push({ tone: momPct >= 0 ? 'up' : 'down', text: `Pipeline volume ${momPct >= 0 ? 'up' : 'down'} ${Math.abs(momPct).toFixed(1)}% month-over-month (${byMonth[curr].toLocaleString()} leads in ${curr}).` });
    if (topRegion) summary.push({ tone: 'info', text: `${topRegion.r} is driving ${Math.round(topRegion.active / totalActive * 100)}% of all active deals — the strongest region this period.` });
    if (tierTop && tierBot) {
      const gap = tierTop.rate - tierBot.rate;
      summary.push(gap < 2
        ? { tone: 'warn', text: `Conversion is essentially flat across account tiers (~${tierTop.rate.toFixed(0)}%) — top-value accounts aren't outperforming low-value ones.` }
        : { tone: 'warn', text: `${tierBot.t} converts at ${tierBot.rate.toFixed(0)}% vs ${tierTop.t} at ${tierTop.rate.toFixed(0)}% — a ${gap.toFixed(0)}pt gap to close.` });
    }
    summary.push({ tone: 'info', text: `Estimated active-pipeline value ~₹${(projected >= 1e7 ? (projected / 1e7).toFixed(1) + 'Cr' : projected >= 1e5 ? (projected / 1e5).toFixed(1) + 'L' : (projected / 1e3).toFixed(0) + 'K')} this month (illustrative — based on active leads × est. deal value; no booked deals in this feed).` });

    // ---- Risk watchlist ----
    const risks: { sev: string; label: string; detail: string }[] = [];
    if (unassignedPct >= 15) risks.push({ sev: 'high', label: 'Unassigned pipeline', detail: `${unassignedPct.toFixed(0)}% of leads have no owner — revenue at risk of going cold.` });
    if (coaching.length) risks.push({ sev: 'high', label: 'Reps below bar', detail: `${coaching.length} rep${coaching.length > 1 ? 's' : ''} in the Priority-Coaching band${coaching.length <= 3 ? ': ' + coaching.map(c => c.owner).join(', ') : ''}.` });
    if (t1) {
      const others = tierStats.filter(x => x.t !== 'Tier 1');
      const avgOther = others.length ? others.reduce((a, x) => a + x.rate, 0) / others.length : 0;
      if (t1.rate <= avgOther) risks.push({ sev: 'med', label: 'Premium accounts underperforming', detail: `Tier 1 conversion (${t1.rate.toFixed(0)}%) is at or below lower tiers — high-value pipeline not prioritised.` });
    }
    if (worstDropRegion) risks.push({ sev: 'med', label: `${worstDropRegion.r} fall-out`, detail: `Highest drop rate of any region at ${worstDropRegion.drop.toFixed(1)}% of assigned leads.` });
    if (noQa > 0) risks.push({ sev: 'low', label: 'QA coverage gap', detail: `${noQa} rep${noQa > 1 ? 's' : ''} have no quality-review score on file.` });

    return {
      summary,
      target: { target, achieved, attainment, projected, pacePct, elapsed, curr, daysInMonth, maxDay, topPerf },
      risks: risks.slice(0, 5),
    };
  }, [filteredLeads, data]);

  const unkRegion = filteredLeads.filter(l => l.region === 'Unknown').length;
  const noCity = filteredLeads.filter(l => !l.city || l.city === 'Other').length;
  const noAi = data ? Object.keys(data.bds).filter(o => {
    const bd = data.bds[o];
    return bd && !bd.q;
  }).length : 0;

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

  const formatCurrency = (num: number) => {
    return Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 2 }).format(num);
  };

  const BRAND_COLORS: Record<string, string> = {
    'Olive': '#502875',
    'Spark': '#da1a84',
    'Open Hotels': '#a470d6'
  };

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
            Business Development Dashboard
            <span className="px-2 py-0.5 rounded bg-brand-pink-500/20 border border-brand-pink-500/50 text-brand-pink-400 text-[10px] uppercase tracking-widest shadow-[0_0_15px_rgba(218,26,132,0.3)]">Executive View</span>
          </h1>
          <p className="text-text-secondary text-sm mt-1 font-medium">Real-time pipeline velocity and revenue projections.</p>
        </div>

        <div className="flex items-center gap-4">
          <InsightsDropdown />
        </div>
      </header>

      {/* Executive Summary */}
      {exec && <ExecSummary bullets={exec.summary as SummaryBullet[]} />}

      {/* Financial KPI Rail */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 relative z-10">
        <FinancialCard
          title="Est. Pipeline Value"
          value={formatCurrency(totalPipelineValue)}
          subtitle={`${totalLeads.toLocaleString()} Leads · est.`}
          icon={Building2}
          color="#a470d6"
          prefix="₹"
        />
        <FinancialCard
          title="Est. Active Value"
          value={formatCurrency(projectedRevenue)}
          subtitle={`${activeDealsCount.toLocaleString()} Active Deals · est.`}
          icon={DollarSign}
          color="#34d399"
          prefix="₹"
        />
        <FinancialCard
          title="Active Rate"
          value={activeRate.toFixed(1)}
          subtitle={`${activeDealsCount.toLocaleString()} of ${metrics.n.toLocaleString()} assigned`}
          icon={Target}
          color="#da1a84"
          prefix=""
          suffix="%"
        />
        <FinancialCard
          title="Drop Rate"
          value={metrics.drop.toFixed(1)}
          subtitle={`${metrics.dropped.toLocaleString()} Dropped`}
          icon={Zap}
          color="#ffb020"
          prefix=""
          suffix="%"
        />
        <FinancialCard
          title="Contact Rate"
          value={metrics.contact.toFixed(1)}
          subtitle={`${metrics.n.toLocaleString()} Accounts Engaged`}
          icon={Activity}
          color="#38bdf8"
          prefix=""
          suffix="%"
        />
      </div>

      {/* Revenue Target Pacing + Risk Watchlist */}
      {exec && (
        <div className="grid grid-cols-1 gap-4 sm:gap-6 relative z-10">

          {/* Risk Watchlist */}
          <div className="glass-panel p-4 sm:p-6 flex flex-col">
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

        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6 relative z-10">
        <PropertyStatusCard />
        <CallingQualityCard />
      </div>

      {/* Main Analytical Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6 relative z-10">

        {/* Pipeline Funnel */}
        <div className="glass-panel p-4 sm:p-6 xl:col-span-1 min-h-[380px] flex flex-col relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent pointer-events-none" />
          <h2 className="text-xs font-bold uppercase tracking-widest text-white mb-6 flex items-center justify-between">
            <span>Pipeline Conversion Matrix</span>
            <BarChart2 className="w-4 h-4 text-text-secondary" />
          </h2>
          <div className="flex-1">
            <FunnelChart leads={filteredLeads} />
          </div>
        </div>

        {/* Revenue Velocity Trend */}
        <div className="glass-panel p-4 sm:p-6 xl:col-span-2 min-h-[380px] flex flex-col relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-32 bg-brand-pink-500/5 blur-[100px] rounded-full pointer-events-none" />
          <h2 className="text-xs font-bold uppercase tracking-widest text-white mb-6 flex items-center justify-between">
            <span>Revenue Velocity Trend</span>
            <TrendingUp className="w-4 h-4 text-text-secondary" />
          </h2>
          <div className="flex-1 w-full min-h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorPipeline" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#502875" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#502875" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#34d399" stopOpacity={0.6}/>
                    <stop offset="95%" stopColor="#34d399" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2930" vertical={false} />
                <XAxis dataKey="month" stroke="#9896a3" tick={{fill: '#9896a3', fontSize: 11}} tickLine={false} axisLine={false} />
                <YAxis
                  stroke="#9896a3"
                  tick={{fill: '#9896a3', fontSize: 11}}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => `₹${formatCurrency(val)}`}
                />
                <RechartsTooltip
                  contentStyle={{ backgroundColor: '#16151a', border: '1px solid #2a2930', borderRadius: '8px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}
                  itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 600 }}
                  labelStyle={{ color: '#9896a3', fontSize: '11px', marginBottom: '4px' }}
                  formatter={(value: any) => [`₹${Number(value || 0).toLocaleString('en-IN')}`, undefined]}
                />
                <Area type="monotone" name="Pipeline Volume" dataKey="Pipeline Volume" stroke="#a470d6" strokeWidth={2} fillOpacity={1} fill="url(#colorPipeline)" />
                <Area type="monotone" name="Active Pipeline (est.)" dataKey="Active Pipeline (est.)" stroke="#34d399" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6 relative z-10">

        {/* Executive Leaderboard */}
        <div className="glass-panel p-4 sm:p-6 xl:col-span-1 min-h-[380px] flex flex-col">
          <h2 className="text-xs font-bold uppercase tracking-widest text-white mb-6 flex items-center justify-between border-b border-border-subtle pb-4">
            <span className="flex items-center gap-2"><Award className="w-4 h-4 text-brand-pink-400"/> Elite Performers</span>
            <span className="text-[10px] text-text-secondary bg-surface px-2 py-1 rounded">By Pipeline Generated</span>
          </h2>
          <div className="flex-1 flex flex-col gap-4">
            {leaderboard.map((bd, i) => {
              const score = bd.bps?.score || 0;
              const activePct = bd.active || 0;
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
                  <div className="text-sm font-black text-brand-pink-400">₹{formatCurrency(bd.n * AVG_DEAL_SIZE)}</div>
                  <div className="text-[10px] text-emerald-400 font-bold mt-0.5">{activePct.toFixed(1)}% Active</div>
                </div>
              </div>
            )})}
          </div>
        </div>

        {/* Regional Market Penetration */}
        <div className="glass-panel p-4 sm:p-6 xl:col-span-2 min-h-[380px] flex flex-col">
          <h2 className="text-xs font-bold uppercase tracking-widest text-white mb-6 flex items-center justify-between">
            <span>Strategic Market Penetration</span>
            <Building2 className="w-4 h-4 text-text-secondary" />
          </h2>
          <div className="flex-1 w-full min-h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={regionalData} margin={{ top: 20, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2930" vertical={false} />
                <XAxis dataKey="region" stroke="#9896a3" tick={{fill: '#9896a3', fontSize: 11}} tickLine={false} axisLine={false} />
                <YAxis
                  yAxisId="left"
                  stroke="#9896a3"
                  tick={{fill: '#9896a3', fontSize: 11}}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => `₹${formatCurrency(val)}`}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke="#9896a3"
                  tick={{fill: '#9896a3', fontSize: 11}}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => `${val}%`}
                />
                <RechartsTooltip
                  contentStyle={{ backgroundColor: '#16151a', border: '1px solid #2a2930', borderRadius: '8px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}
                  itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 600 }}
                  formatter={(value: any, name: any) => [
                    name === 'Conversion %' ? `${Number(value || 0).toFixed(1)}%` : `₹${Number(value || 0).toLocaleString('en-IN')}`,
                    name
                  ]}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Bar yAxisId="left" dataKey="Total Pipeline" fill="#502875" radius={[4, 4, 0, 0]} barSize={40} />
                <Bar yAxisId="left" dataKey="Active Revenue" fill="#da1a84" radius={[4, 4, 0, 0]} barSize={40} />
                <Line yAxisId="right" type="monotone" dataKey="Conversion %" stroke="#34d399" strokeWidth={3} dot={{ r: 4, fill: '#16151a', strokeWidth: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6 relative z-10">
        {/* Brand Capitalization */}
        <div className="glass-panel p-4 sm:p-6 xl:col-span-1 min-h-[280px] flex flex-col justify-center">
          <h2 className="text-xs font-bold uppercase tracking-widest text-white mb-6">
            Brand Capitalization
          </h2>
          <div className="flex flex-col gap-6 w-full">
            {(() => {
              const totalBrandValue = brandData.reduce((acc, b) => acc + b.value, 0);

              if (totalBrandValue === 0) return <div className="text-sm text-text-secondary">No data available</div>;

              return (
                <>
                  {/* Single Stacked Bar */}
                  <div className="w-full h-4 bg-surface rounded-full overflow-hidden flex shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]">
                    {brandData.map(b => {
                      const pct = (b.value / totalBrandValue) * 100;
                      return (
                        <div
                          key={b.name}
                          className="h-full transition-all duration-1000 relative border-r border-black/50 last:border-0"
                          style={{ width: `${pct}%`, backgroundColor: BRAND_COLORS[b.name] || '#4a4957' }}
                        >
                          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
                        </div>
                      )
                    })}
                  </div>

                  {/* Legend and Metrics */}
                  <div className="flex flex-col gap-3 mt-2">
                    {brandData.map(b => {
                      const pct = (b.value / totalBrandValue) * 100;
                      return (
                        <div key={b.name} className="flex items-center justify-between p-3 rounded-lg bg-black/20 border border-border-subtle/50 hover:bg-surface/40 transition-colors group">
                          <div className="flex items-center gap-3">
                            <div className="w-3 h-3 rounded-sm shadow-[0_0_10px_currentColor]" style={{ backgroundColor: BRAND_COLORS[b.name] || '#4a4957', color: BRAND_COLORS[b.name] || '#4a4957' }} />
                            <div>
                              <p className="text-sm font-bold text-white group-hover:text-brand-pink-400 transition-colors">{b.name}</p>
                              <p className="text-[10px] text-text-secondary uppercase tracking-wider">{pct.toFixed(1)}% Share</p>
                            </div>
                          </div>
                          <div className="text-right text-base font-black" style={{ color: BRAND_COLORS[b.name] || '#ffffff' }}>
                            ₹{formatCurrency(b.value)}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              );
            })()}
          </div>
        </div>

        {/* Operations Integrity Strip */}
        <div className="glass-panel p-4 sm:p-6 xl:col-span-2 flex flex-col justify-center bg-gradient-to-r from-black/40 to-brand-purple-900/10">
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
        <div className="flex items-baseline gap-0.5">
          {prefix && <span className="text-xl font-bold text-text-secondary -translate-y-1">{prefix}</span>}
          <span className="text-2xl sm:text-3xl font-black tracking-tight text-white">{value}</span>
          {suffix && <span className="text-xl font-bold text-text-secondary -translate-y-1">{suffix}</span>}
        </div>
        <div className="mt-2 text-[10px] font-bold uppercase tracking-wider text-text-secondary/80 border-t border-border-subtle/50 pt-2 flex items-center justify-between">
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
