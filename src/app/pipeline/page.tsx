'use client';

import { useDashboard } from '@/lib/DashboardContext';
import { useMemo } from 'react';
import clsx from 'clsx';
import { PhoneCall, MessagesSquare, BadgeCheck, XCircle, MapPin, Layers, Trophy, ArrowRight, Inbox } from 'lucide-react';
import { ExecSummary, SummaryBullet } from '@/components/ExecSummary';

// Pipeline stages in logical progression order, matching the real status taxonomy
// (dashboard_data.json). "Lead Dropped" is tracked separately as fall-out.
const STAGES = [
  { key: 'New Leads', label: 'New', color: '#5a7ea3', icon: Inbox },
  { key: 'Lead Contacted', label: 'Contacted', color: '#6d3a9e', icon: PhoneCall },
  { key: 'Under Discussion', label: 'Under Discussion', color: '#9d4edd', icon: MessagesSquare },
  { key: 'Awaiting Business Approval', label: 'Awaiting Approval', color: '#da1a84', icon: BadgeCheck },
  { key: 'Lead Dropped', label: 'Dropped', color: '#4a4957', icon: XCircle },
];

const ACTIVE_KEYS = ['Under Discussion', 'Awaiting Business Approval'];

type Row = { name: string; total: number; [stage: string]: number | string };

export default function Pipeline() {
  const { filteredLeads, isLoading, setFilter } = useDashboard();

  const getSplitData = (field: keyof typeof filteredLeads[0]): Row[] => {
    const groups: Record<string, Record<string, number>> = {};
    filteredLeads.forEach(l => {
      const g = (l[field] as string) || 'Unknown';
      const s = l.status || '(unassigned)';
      if (!groups[g]) groups[g] = {};
      groups[g][s] = (groups[g][s] || 0) + 1;
    });

    return Object.keys(groups).map(name => {
      const obj: any = { name, total: 0 };
      STAGES.forEach(st => {
        obj[st.key] = groups[name][st.key] || 0;
        obj.total += obj[st.key];
      });
      return obj;
    }).filter(r => r.total > 0).sort((a, b) => b.total - a.total).slice(0, 15);
  };

  const regionData = useMemo(() => getSplitData('region'), [filteredLeads]);
  const tierData = useMemo(() => getSplitData('tier'), [filteredLeads]);

  // Overall pipeline totals across the current filter.
  const overview = useMemo(() => {
    const t: Record<string, number> = Object.fromEntries(STAGES.map(s => [s.key, 0]));
    filteredLeads.forEach(l => {
      if (l.status && t[l.status] !== undefined) t[l.status]++;
    });
    const total = STAGES.reduce((acc, st) => acc + t[st.key], 0);
    const active = ACTIVE_KEYS.reduce((acc, k) => acc + t[k], 0);
    return {
      counts: t,
      total,
      active,
      activeRate: total ? (active / total) * 100 : 0,
      dropRate: total ? (t['Lead Dropped'] / total) * 100 : 0,
    };
  }, [filteredLeads]);

  // Real per-BD breakdown — top BDs by lead volume, same stage shape as Region/Tier rows.
  const bdData = useMemo(
    () => getSplitData('owner').filter(r => r.name !== 'Unknown' && r.name !== '(unassigned)'),
    [filteredLeads]
  );

  if (isLoading) return null;

  const num = (n: number) => n.toLocaleString();

  const topRegionRow = regionData[0];
  const dominantStage = STAGES.filter(st => st.key !== 'Lead Dropped')
    .map(st => ({ label: st.label, v: overview.counts[st.key] }))
    .sort((a, b) => b.v - a.v)[0];
  const summaryBullets: SummaryBullet[] = [
    { tone: overview.activeRate >= overview.dropRate ? 'up' : 'warn', text: `${overview.activeRate.toFixed(0)}% of the pipeline is still active and ${overview.dropRate.toFixed(0)}% has dropped, across ${num(overview.total)} leads.` },
    ...(dominantStage ? [{ tone: 'info' as const, text: `Most leads sit in "${dominantStage.label}" (${num(dominantStage.v)}) — the current bottleneck stage.` }] : []),
    ...(topRegionRow ? [{ tone: 'info' as const, text: `${topRegionRow.name} carries the largest pipeline at ${num(topRegionRow.total as number)} leads.` }] : []),
    ...(bdData[0] ? [{ tone: 'up' as const, text: `${bdData[0].name} leads all reps by volume (${num(bdData[0].total as number)} leads).` }] : []),
  ];

  // Slim multi-stage bar used in every list row.
  const StageBar = ({ row, max }: { row: Row; max: number }) => {
    const total = row.total as number;
    const scale = max > 0 ? total / max : 0; // width of the whole row relative to the biggest row
    return (
      <div className="h-2.5 rounded-full bg-surface/70 overflow-hidden flex" style={{ width: `${Math.max(6, scale * 100)}%` }}>
        {STAGES.map(st => {
          const v = (row[st.key] as number) || 0;
          const pct = total > 0 ? (v / total) * 100 : 0;
          if (pct <= 0) return null;
          return (
            <div
              key={st.key}
              className="h-full"
              style={{ width: `${pct}%`, backgroundColor: st.color }}
              title={`${st.label}: ${num(v)}`}
            />
          );
        })}
      </div>
    );
  };

  const activeOf = (row: Row) => {
    const total = row.total as number;
    const active = ACTIVE_KEYS.reduce((acc, k) => acc + ((row[k] as number) || 0), 0);
    return total > 0 ? (active / total) * 100 : 0;
  };

  // Generic breakdown card (Region / Tier).
  const BreakdownCard = ({ title, icon: Icon, data, filterKey }: { title: string; icon: any; data: Row[]; filterKey: string }) => {
    const max = data.reduce((m, r) => Math.max(m, r.total as number), 0);
    return (
      <div className="glass-panel p-4 sm:p-6 flex flex-col">
        <h2 className="text-xs font-bold uppercase tracking-widest text-white mb-5 flex items-center gap-2 shrink-0">
          <Icon className="w-4 h-4 text-brand-purple-400" /> {title}
        </h2>
        <div className="flex flex-col gap-1">
          {data.map(row => (
            <button
              key={row.name}
              onClick={() => setFilter(filterKey as any, row.name)}
              className="group text-left rounded-xl px-3 py-3 hover:bg-surface/40 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-white">{row.name}</span>
                <div className="flex items-baseline gap-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">{activeOf(row).toFixed(0)}% active</span>
                  <span className="text-sm font-black text-white tabular-nums">{num(row.total as number)}</span>
                </div>
              </div>
              <StageBar row={row} max={max} />
            </button>
          ))}
          {data.length === 0 && <div className="text-sm text-text-secondary py-6 text-center">No data in this view.</div>}
        </div>
      </div>
    );
  };

  return (
    <div className="pb-20 flex flex-col gap-4 sm:gap-6">
      <header>
        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Pipeline Stages</h1>
        <p className="text-text-secondary text-sm mt-1">Where every lead sits right now — and how much is still in play.</p>
      </header>

      <ExecSummary bullets={summaryBullets} />

      {/* ── Pipeline Overview ───────────────────────────── */}
      <div className="glass-panel p-4 sm:p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-72 h-72 bg-brand-pink-500/5 blur-[120px] rounded-full pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6 relative z-10">
          <h2 className="text-xs font-bold uppercase tracking-widest text-white">Pipeline Overview</h2>
          <div className="flex items-center gap-4 sm:gap-6 flex-wrap w-full lg:w-auto justify-between lg:justify-start">
            <div className="text-right">
              <div className="text-[10px] font-bold uppercase tracking-widest text-text-secondary">Still Active</div>
              <div className="text-xl font-black text-emerald-400 leading-tight">{overview.activeRate.toFixed(1)}%</div>
            </div>
            <div className="w-px h-8 bg-border-subtle" />
            <div className="text-right">
              <div className="text-[10px] font-bold uppercase tracking-widest text-text-secondary">Dropped</div>
              <div className="text-xl font-black text-white leading-tight">{overview.dropRate.toFixed(1)}%</div>
            </div>
            <div className="w-px h-8 bg-border-subtle" />
            <div className="text-right">
              <div className="text-[10px] font-bold uppercase tracking-widest text-text-secondary">Total Leads</div>
              <div className="text-xl font-black text-white leading-tight">{num(overview.total)}</div>
            </div>
          </div>
        </div>

        {/* One clean full-pipeline bar */}
        <div className="h-4 rounded-full bg-surface overflow-hidden flex shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] relative z-10">
          {STAGES.map(st => {
            const v = overview.counts[st.key];
            const pct = overview.total > 0 ? (v / overview.total) * 100 : 0;
            if (pct <= 0) return null;
            return (
              <div
                key={st.key}
                className="h-full transition-all duration-700 relative border-r border-black/40 last:border-0"
                style={{ width: `${pct}%`, backgroundColor: st.color }}
              >
                <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/15 to-transparent" />
              </div>
            );
          })}
        </div>

        {/* Stage tiles */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5 relative z-10">
          {STAGES.map((st, i) => {
            const v = overview.counts[st.key];
            const pct = overview.total > 0 ? (v / overview.total) * 100 : 0;
            const Icon = st.icon;
            const isDrop = st.key === 'Lead Dropped';
            return (
              <div
                key={st.key}
                className={clsx(
                  'relative rounded-xl p-4 border bg-black/20 flex flex-col gap-2',
                  isDrop ? 'border-border-subtle/40' : 'border-border-subtle/60'
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${st.color}22` }}>
                      <Icon className="w-3.5 h-3.5" style={{ color: st.color }} />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">{st.label}</span>
                  </div>
                  {i < STAGES.length - 2 && <ArrowRight className="w-3.5 h-3.5 text-border-subtle hidden lg:block" />}
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-white tabular-nums">{num(v)}</span>
                  <span className="text-xs font-bold text-text-secondary">{pct.toFixed(0)}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Region / Tier breakdowns ────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <BreakdownCard title="By Region" icon={MapPin} data={regionData} filterKey="region" />
        <BreakdownCard title="By Tier" icon={Layers} data={tierData} filterKey="tier" />
      </div>

      {/* ── Top BDs leaderboard ─────────────────────────── */}
      <div className="glass-panel p-4 sm:p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xs font-bold uppercase tracking-widest text-white flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-400" /> Top Performers
          </h2>
          <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary bg-surface px-2 py-1 rounded">By lead volume</span>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 mb-5 pb-4 border-b border-border-subtle/50">
          {STAGES.map(st => (
            <div key={st.key} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: st.color }} />
              <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">{st.label}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-8 gap-y-1">
          {bdData.length === 0 && <div className="text-sm text-text-secondary py-6 text-center xl:col-span-2">No assigned-owner data in this view.</div>}
          {(() => {
            const max = bdData.reduce((m, r) => Math.max(m, r.total as number), 0);
            return bdData.map((row, i) => (
              <button
                key={row.name}
                onClick={() => setFilter('owner' as any, row.name)}
                className="group text-left rounded-xl px-3 py-3 hover:bg-surface/40 transition-colors flex items-center gap-4"
              >
                <span className={clsx(
                  'w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black shrink-0',
                  i === 0 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                  i === 1 ? 'bg-slate-300/20 text-slate-300 border border-slate-300/30' :
                  i === 2 ? 'bg-orange-700/20 text-orange-500 border border-orange-700/30' :
                  'bg-surface text-text-secondary'
                )}>
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold text-white truncate">{row.name}</span>
                    <div className="flex items-baseline gap-3 shrink-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">{activeOf(row).toFixed(0)}% active</span>
                      <span className="text-sm font-black text-white tabular-nums">{num(row.total as number)}</span>
                    </div>
                  </div>
                  <StageBar row={row} max={max} />
                </div>
              </button>
            ));
          })()}
        </div>
      </div>
    </div>
  );
}
