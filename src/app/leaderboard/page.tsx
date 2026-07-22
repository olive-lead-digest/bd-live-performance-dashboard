'use client';

import { useDashboard } from '@/lib/DashboardContext';
import { buildLeaderboard, qaCoverage, rosterOwnerSet, signingsByOwner } from '@/lib/utils';
import { useMemo, useState } from 'react';
import { useDialog } from '@/lib/useDialog';
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import { X, Star, AlertTriangle, CheckCircle2, TrendingUp, Sparkles, Filter as FilterIcon } from 'lucide-react';
import clsx from 'clsx';
import type { LeaderboardRec } from '@/lib/types';
import { ExecSummary, SummaryBullet } from '@/components/ExecSummary';

type SortOption = 'score' | 'signings' | 'volume' | 'active';

export default function Leaderboard() {
  const { data, filteredLeads, dealsRuntime, isLoading } = useDashboard();
  const [selectedRep, setSelectedRep] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('score');
  // P2-3 — rep detail drawer gets dialog semantics: focus trap, ESC, focus
  // restore. Hook is called unconditionally (before any early return) and only
  // activates while a rep is selected.
  const repDrawerRef = useDialog<HTMLDivElement>(() => setSelectedRep(null), !!selectedRep);

  const leaderboard = useMemo(() => {
    if (!data) return [];
    // P1-8: tag anyone not in the org roster (ex-BD / test account) as inactive.
    // Signings (MA + LOI) per BD fold into the balanced score (primary KPI).
    const sig = signingsByOwner(dealsRuntime.deals);
    let list = buildLeaderboard(filteredLeads, data.bds, data.weights, rosterOwnerSet(data.org), sig);

    // Apply inline sorting
    list.sort((a, b) => {
      if (sortBy === 'score') return (b.bps?.score || 0) - (a.bps?.score || 0);
      if (sortBy === 'signings') return (b.signings || 0) - (a.signings || 0);
      if (sortBy === 'volume') return b.n - a.n;
      if (sortBy === 'active') return b.active - a.active;
      return 0;
    });

    return list;
  }, [data, filteredLeads, sortBy, dealsRuntime]);

  const groupedData = useMemo(() => {
    const groups: Record<string, LeaderboardRec[]> = {
      'Top performer': [],
      'Strong': [],
      'Developing': [],
      'Priority coaching': []
    };
    
    leaderboard.forEach(rep => {
      if (rep.inactive) return; // P1-8: not in roster → excluded from band counts
      // P1-8: only reps with a COMPUTED band (reviewed → bps) belong in one of
      // the 4 performance bands. 'Pending review' reps have no score and must
      // NOT be force-fit into Developing — doing so inflated Leaderboard's
      // Developing count vs Reporting (which counts only scored reps), so the
      // two pages disagreed. Skip them → band counts identical across pages.
      if (!rep.bps) return;
      let baseBand = rep.band.replace(' review', '').replace(' coaching', '');
      if (baseBand === 'Priority') baseBand = 'Priority coaching';
      if (groups[baseBand]) {
        groups[baseBand].push(rep);
      }
    });
    return groups;
  }, [leaderboard]);

  // P1-8 — reps present in the data but NOT in the org roster (bd_org.json):
  // ex-BDs / test accounts. Shown separately, tagged, excluded from all counts.
  const inactiveReps = useMemo(() => leaderboard.filter(r => r.inactive), [leaderboard]);
  const activeReps = useMemo(() => leaderboard.filter(r => !r.inactive), [leaderboard]);
  const qa = useMemo(() => qaCoverage(data), [data]);

  const analysisText = useMemo(() => {
    if (!leaderboard.length) return "No data available for current filters.";
    const topCount = groupedData['Top performer'].length;
    const totalCount = leaderboard.length;
    const topPct = ((topCount / totalCount) * 100).toFixed(0);
    const topVol = groupedData['Top performer'].reduce((s, r) => s + r.n, 0);
    const totalVol = leaderboard.reduce((s, r) => s + r.n, 0);
    const volPct = totalVol > 0 ? ((topVol / totalVol) * 100).toFixed(0) : "0";
    const coachingCount = groupedData['Priority coaching'].length;
    
    return `Analysis indicates that the ${topCount} Top Performers (${topPct}% of team) are driving ${volPct}% of total lead volume. ${coachingCount > 0 ? `Attention required: ${coachingCount} reps have fallen into Priority Coaching due to critical drop rates.` : 'Team health is strong with no reps in Priority Coaching.'}`;
  }, [groupedData, leaderboard]);

  const summaryBullets = useMemo<SummaryBullet[]>(() => {
    if (!leaderboard.length) return [];
    const b: SummaryBullet[] = [];
    const top = groupedData['Top performer'] || [];
    const coaching = groupedData['Priority coaching'] || [];
    // P1-8: all team-size / percentage bases use the ACTIVE roster only.
    const totalCount = activeReps.length;
    const totalVol = activeReps.reduce((s, r) => s + r.n, 0);
    const topVol = top.reduce((s, r) => s + r.n, 0);
    const volPct = totalVol ? Math.round((topVol / totalVol) * 100) : 0;
    const best = [...activeReps].sort((a, c) => (c.bps?.score || 0) - (a.bps?.score || 0))[0];
    if (best && best.bps) b.push({ tone: 'up', text: `${best.owner} leads the team with a ${best.bps.score.toFixed(0)} balanced score.` });
    b.push({ tone: 'info', text: `${top.length} top performer${top.length !== 1 ? 's' : ''} (${totalCount ? Math.round(top.length / totalCount * 100) : 0}% of team) drive ${volPct}% of all lead volume.` });
    b.push(coaching.length
      ? { tone: 'warn', text: `${coaching.length} rep${coaching.length > 1 ? 's' : ''} in Priority Coaching need intervention on drop rates.` }
      : { tone: 'up', text: `No reps in Priority Coaching — team health is strong.` });
    // P1-8: ONE QA-coverage figure (roster-based), identical to Overview.
    b.push({ tone: 'info', text: `${qa.reviewed} of ${qa.total} roster BDs have an AI quality review on file${qa.missing ? ` (${qa.missing} missing)` : ''}.` });
    return b;
  }, [groupedData, leaderboard, activeReps, qa]);

  if (isLoading || !data) return null;

  const getBandColor = (band: string) => {
    if (band.includes('Top')) return 'text-brand-pink-500 bg-brand-pink-500/10 border-brand-pink-500/30';
    if (band.includes('Strong')) return 'text-brand-purple-400 bg-brand-purple-400/10 border-brand-purple-400/30';
    if (band.includes('Developing')) return 'text-brand-purple-200 bg-brand-purple-200/10 border-brand-purple-200/30';
    if (band.includes('Priority')) return 'text-brand-pink-800 bg-brand-pink-800/20 border-brand-pink-800/40';
    return 'text-text-secondary bg-surface/50 border-border-subtle';
  };

  const getRowGlow = (band: string) => {
    if (band.includes('Top')) return 'hover:border-brand-pink-500/50 hover:shadow-[0_0_20px_rgba(218,26,132,0.15)] hover:bg-brand-pink-500/5';
    if (band.includes('Strong')) return 'hover:border-brand-purple-400/50 hover:shadow-[0_0_15px_rgba(124,58,173,0.15)] hover:bg-brand-purple-400/5';
    if (band.includes('Priority')) return 'hover:border-brand-pink-800/50 hover:bg-brand-pink-800/10';
    return 'hover:border-border-subtle hover:bg-surface/30';
  };

  const selectedData = selectedRep ? leaderboard.find(r => r.owner === selectedRep) : null;

  return (
    <div className="pb-20 relative">
      <header className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Performance Leaderboard</h1>
          <p className="text-text-secondary text-sm mt-1">Balanced scoring across quality, conversion, and volume.</p>
        </div>
        <div className="flex items-center gap-2 bg-surface p-1.5 rounded-lg border border-border-subtle shrink-0">
          <FilterIcon className="w-4 h-4 text-text-secondary ml-2" />
          <span className="text-xs font-bold text-text-secondary uppercase mr-1">Sort:</span>
          {(['score', 'signings', 'volume', 'active'] as SortOption[]).map(opt => (
            <button
              key={opt}
              type="button"
              onClick={() => setSortBy(opt)}
              aria-pressed={sortBy === opt}
              className={clsx(
                // P2-1 — real button hit target: ≥36px tall, pointer cursor,
                // visible hover / active / focus-visible states.
                "px-3 py-1.5 min-h-[44px] md:min-h-[36px] rounded-md text-xs font-bold transition-all capitalize cursor-pointer select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-400 focus-visible:ring-offset-1 focus-visible:ring-offset-surface active:scale-95",
                sortBy === opt ? "bg-brand-pink-500 text-white shadow-[0_0_10px_rgba(218,26,132,0.4)]" : "text-text-secondary hover:text-white hover:bg-surface-light"
              )}
            >
              {opt}
            </button>
          ))}
        </div>
      </header>

      <ExecSummary bullets={summaryBullets} />

      {/* P1-9 — legend: the small range under Active%/Drop% is a 95% confidence
          interval, not a separate count. Documented on-screen so the paired
          "13% / 11-17" reads unambiguously. */}
      <div className="hidden md:block glass-card px-4 py-3 mb-6 text-[11px] text-text-secondary leading-relaxed">
        <span className="font-bold text-white uppercase tracking-widest text-[10px]">Legend</span>
        <span className="ml-2">
          <b className="text-white">Score</b> — balanced BD score (quality, conversion, compliance, lead &amp; call volume).
          {' '}<b className="text-white">Active% / Drop%</b> — the point estimate with a <b className="text-white">95% confidence interval</b> shown as the small range beneath it
          (e.g. &ldquo;13% / 11–17&rdquo; means 13% active, 95% CI 11–17%); the CI is shown only for reps with ≥10 leads, where the rate is statistically meaningful.
          {' '}<b className="text-white">Sign.</b> — MA + Spark-LOI signings. <b className="text-white">QA Rating</b> — AI call-review score out of 10.
        </span>
      </div>

      <div className="flex flex-col gap-10">
        {(['Top performer', 'Strong', 'Developing', 'Priority coaching']).map((groupName) => {
          const groupReps = groupedData[groupName];
          if (!groupReps || groupReps.length === 0) return null;

          return (
            <div key={groupName} className="flex flex-col gap-4">
              <div className="flex items-center gap-3 border-b border-border-subtle pb-2">
                <h3 className="text-lg font-bold text-white">{groupName}</h3>
                <span className={clsx("px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border", getBandColor(groupName))}>
                  {groupReps.length} Reps
                </span>
              </div>

              {/* Desktop Table Header */}
              <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-2 text-xs font-semibold text-text-secondary uppercase tracking-wider">
                <div className="col-span-3">BD Rep</div>
                <div className="col-span-1 text-center">Score</div>
                <div className="col-span-2">Score Profile</div>
                <div className="col-span-1 text-right">Sign.</div>
                <div className="col-span-1 text-right">Leads</div>
                <div className="col-span-1 text-right">Active%</div>
                <div className="col-span-1 text-right">Drop%</div>
                <div className="col-span-2 text-right">QA Rating</div>
              </div>

              {/* Rep Rows / Cards */}
              <div className="grid grid-cols-1 gap-3">
                {groupReps.map((r, i) => (
                  <div 
                    key={r.owner}
                    onClick={() => setSelectedRep(r.owner)}
                    className={clsx(
                      "glass-card p-4 md:px-6 md:py-4 grid grid-cols-1 md:grid-cols-12 gap-4 md:items-center cursor-pointer transition-all duration-300 border relative overflow-hidden",
                      selectedRep === r.owner ? "border-brand-purple-400 bg-brand-purple-900/20" : `border-transparent ${getRowGlow(groupName)}`
                    )}
                  >
                    {/* Mobile Only: Band indicator line */}
                    <div className={clsx("md:hidden absolute left-0 top-0 bottom-0 w-1", getBandColor(groupName).split(' ')[1])} />

                    <div className="col-span-1 md:col-span-3 flex items-center justify-between md:justify-start gap-3">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-black text-text-secondary w-5 hidden md:block">{i + 1}.</span>
                        <span className="text-base md:text-sm font-bold text-white truncate">{r.owner}</span>
                        {(r.low || r.n < 25) && <Star className="w-3.5 h-3.5 md:w-3 md:h-3 text-yellow-500 fill-yellow-500" />}
                      </div>
                      {/* Mobile Only: Signings + Score */}
                      <div className="md:hidden flex items-baseline gap-2">
                        <span className="text-[10px] text-brand-pink-400 uppercase font-bold">{r.signings ?? 0} sign</span>
                        <span className="text-lg font-black text-white">{r.bps ? r.bps.score.toFixed(0) : '—'}</span>
                      </div>
                    </div>

                    <div className="col-span-1 text-center hidden md:block">
                      {r.bps ? (
                        <span className="text-lg font-black text-white">{r.bps.score.toFixed(0)}</span>
                      ) : (
                        <span className="text-text-secondary">&mdash;</span>
                      )}
                    </div>

                    <div className="col-span-1 md:col-span-2 flex md:items-end gap-1.5 md:gap-1 h-10 md:h-6">
                      {r.bps ? (
                        <>
                          <div className="w-full md:w-4 bg-brand-pink-500 rounded-sm transition-all" style={{ height: `${Math.max(10, r.bps.Q)}%` }} title="Quality" />
                          <div className="w-full md:w-4 bg-brand-pink-400 rounded-sm transition-all" style={{ height: `${Math.max(10, r.bps.Cv)}%` }} title="Conversion" />
                          <div className="w-full md:w-4 bg-brand-purple-400 rounded-sm transition-all" style={{ height: `${Math.max(10, r.bps.Cmp)}%` }} title="Compliance" />
                          <div className="w-full md:w-4 bg-brand-purple-300 rounded-sm transition-all" style={{ height: `${Math.max(10, r.bps.Lv)}%` }} title="Lead Vol" />
                          <div className="w-full md:w-4 bg-brand-purple-200 rounded-sm transition-all" style={{ height: `${Math.max(10, r.bps.Cav)}%` }} title="Call Vol" />
                        </>
                      ) : <span className="text-xs text-text-secondary italic flex items-end">No profile data</span>}
                    </div>

                    {/* Mobile Only: Stats Grid */}
                    <div className="grid grid-cols-3 gap-2 mt-2 md:hidden">
                      <div className="flex flex-col">
                        <span className="text-[10px] uppercase font-bold text-text-secondary">Leads</span>
                        <span className="text-sm font-semibold text-white">{r.n}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] uppercase font-bold text-text-secondary">Active</span>
                        <span className="text-sm font-semibold text-white">{r.active.toFixed(0)}%</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] uppercase font-bold text-text-secondary">Drop</span>
                        <span className={clsx("text-sm font-semibold", r.drop >= 25 ? "text-brand-pink-500" : "text-white")}>{r.drop.toFixed(0)}%</span>
                      </div>
                    </div>

                    {/* Desktop Stats */}
                    <div className="col-span-1 text-right text-sm font-bold text-brand-pink-400 hidden md:block">{r.signings ?? 0}</div>
                    <div className="col-span-1 text-right text-sm font-semibold text-white hidden md:block">{r.n}</div>
                    
                    <div className="col-span-1 text-right flex flex-col items-end hidden md:flex">
                      <span className={clsx("text-sm font-bold", r.n < 10 ? "text-text-secondary" : "text-white")}>
                        {r.active.toFixed(0)}%
                      </span>
                      {r.n >= 10 && <span className="text-[9px] text-text-secondary">{r.activeCI[0].toFixed(0)}-{r.activeCI[1].toFixed(0)}</span>}
                    </div>

                    <div className="col-span-1 text-right flex flex-col items-end hidden md:flex">
                      <span className={clsx("text-sm font-bold", r.n < 10 ? "text-text-secondary" : r.drop >= 25 ? "text-brand-pink-500" : "text-white")}>
                        {r.drop.toFixed(0)}%
                      </span>
                      {r.n >= 10 && <span className="text-[9px] text-text-secondary">{r.dropCI[0].toFixed(0)}-{r.dropCI[1].toFixed(0)}</span>}
                    </div>

                    <div className="col-span-2 text-right hidden md:block text-sm font-bold text-white">
                      {r.reviewed ? (
                        <div className="flex items-center justify-end gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span>{r.q!.overall.toFixed(1)}/10</span>
                        </div>
                      ) : <span className="text-text-secondary">&mdash;</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {inactiveReps.length > 0 && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 border-b border-border-subtle pb-2">
              <h3 className="text-lg font-bold text-text-secondary">Inactive / not in roster</h3>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border text-text-secondary bg-surface/50 border-border-subtle">
                {inactiveReps.length} excluded
              </span>
            </div>
            <p className="text-xs text-text-secondary -mt-1">
              Present in the leads/deals data but not in the BD org roster (ex-BDs such as &ldquo;Venkatashiva K V&rdquo;, or test accounts). Shown for transparency; excluded from all band counts, percentages and QA coverage.
            </p>
            <div className="grid grid-cols-1 gap-3">
              {inactiveReps.map((r) => (
                <div key={r.owner} className="glass-card p-4 md:px-6 md:py-4 flex items-center justify-between gap-4 border border-transparent opacity-70">
                  <span className="text-sm font-bold text-white">{r.owner}</span>
                  <span className="text-xs text-text-secondary">{r.n} leads · inactive</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {leaderboard.length === 0 && (
          <div className="text-center py-12 text-text-secondary">No reps match the current filters.</div>
        )}
      </div>

      {/* Detail Drawer (Preserved but restyled) */}
      {selectedRep && selectedData && (
        <>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden" onClick={() => setSelectedRep(null)} />
          <div
            ref={repDrawerRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="rep-drawer-title"
            tabIndex={-1}
            className="fixed right-0 top-0 bottom-0 w-full max-w-[420px] glass-panel rounded-none border-y-0 border-r-0 border-l-brand-pink-500/20 z-50 flex flex-col shadow-[0_0_80px_rgba(0,0,0,0.5)] animate-in slide-in-from-right duration-300 focus:outline-none"
          >
            <div className="flex items-center justify-between p-6 border-b border-border-subtle bg-surface/30">
              <div>
                <h2 id="rep-drawer-title" className="text-2xl font-bold text-white">{selectedData.owner}</h2>
                <span className={clsx("text-xs font-semibold uppercase tracking-wider mt-1 px-2 py-0.5 rounded border inline-block mt-2", getBandColor(selectedData.band).split(' ')[0], getBandColor(selectedData.band).split(' ')[1], getBandColor(selectedData.band).split(' ')[2])}>
                  {selectedData.band.replace(' review', '').replace(' coaching', '')}
                </span>
              </div>
              <button type="button" onClick={() => setSelectedRep(null)} aria-label="Close" className="p-2 rounded-lg hover:bg-surface text-text-secondary hover:text-white transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-8 no-scrollbar">
              {selectedData.reviewed && selectedData.bps ? (
                <div
                  role="img"
                  aria-label={`Balanced-score radar for ${selectedData.owner}: Quality ${selectedData.bps.Q.toFixed(0)}, Conversion ${selectedData.bps.Cv.toFixed(0)}, Compliance ${selectedData.bps.Cmp.toFixed(0)}, Lead volume ${selectedData.bps.Lv.toFixed(0)}, Call volume ${selectedData.bps.Cav.toFixed(0)} (out of 100).`}
                  className="h-[280px] w-full -ml-4 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-brand-purple-900/10 via-transparent to-transparent"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={[
                      { subject: 'Quality', A: selectedData.bps.Q },
                      { subject: 'Conv', A: selectedData.bps.Cv },
                      { subject: 'Compliance', A: selectedData.bps.Cmp },
                      { subject: 'Lead Vol', A: selectedData.bps.Lv },
                      { subject: 'Call Vol', A: selectedData.bps.Cav },
                    ]}>
                      <PolarGrid stroke="#2a2930" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: '#9896a3', fontSize: 11, fontWeight: 600 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                      <Radar name={selectedData.owner} dataKey="A" stroke="#da1a84" strokeWidth={2} fill="#da1a84" fillOpacity={0.2} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[120px] flex items-center justify-center text-sm text-text-secondary border border-dashed border-border-subtle rounded-xl">
                  No AI call review yet for this rep.
                </div>
              )}

              <div className="flex flex-col gap-4">
                <h3 className="text-xs font-bold text-brand-pink-400 uppercase tracking-widest border-b border-brand-pink-500/20 pb-2">
                  Performance Metrics
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-surface/50 border border-border-subtle p-3 rounded-lg flex flex-col gap-1">
                    <span className="text-[10px] uppercase font-bold text-text-secondary">Assigned Leads</span>
                    <span className="text-xl font-black text-white">{selectedData.n}</span>
                  </div>
                  <div className="bg-surface/50 border border-border-subtle p-3 rounded-lg flex flex-col gap-1">
                    <span className="text-[10px] uppercase font-bold text-text-secondary">Contact Rate</span>
                    <span className="text-xl font-black text-white">{selectedData.contact.toFixed(0)}%</span>
                  </div>
                  <div className="bg-surface/50 border border-border-subtle p-3 rounded-lg flex flex-col gap-1">
                    <span className="text-[10px] uppercase font-bold text-text-secondary">In-Discussion % (CI)</span>
                    <span className="text-xl font-black text-brand-pink-400">
                      {selectedData.active.toFixed(0)}% 
                    </span>
                    <span className="text-[9px] font-bold text-text-secondary">
                      ({selectedData.activeCI[0].toFixed(0)}-{selectedData.activeCI[1].toFixed(0)})
                    </span>
                  </div>
                  <div className="bg-surface/50 border border-border-subtle p-3 rounded-lg flex flex-col gap-1">
                    <span className="text-[10px] uppercase font-bold text-text-secondary">90d Calls (Conn/Out)</span>
                    <span className="text-xl font-black text-white">{selectedData.zoom.conn} / {selectedData.zoom.out}</span>
                  </div>
                </div>
              </div>

              {selectedData.reviewed && selectedData.q && (
                <div className="flex flex-col gap-4">
                  <h3 className="text-xs font-bold text-brand-purple-400 uppercase tracking-widest border-b border-brand-purple-500/20 pb-2">
                    AI Dimensions
                  </h3>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3 bg-brand-purple-900/10 border border-brand-purple-500/20 p-4 rounded-xl">
                    {data?.dims.map(d => (
                      <div key={d} className="flex justify-between items-center text-sm">
                        <span className="text-text-secondary font-medium capitalize">{d.replace('_', ' ')}</span>
                        <span className="font-black text-white">{selectedData.q![d as keyof typeof selectedData.q]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedData.reviewed && (selectedData.bd.strength || selectedData.bd.risk || selectedData.bd.insight) && (
                <div className="flex flex-col gap-3 mt-2">
                  {selectedData.bd.strength && (
                    <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 mb-1 block">Key Strength</span>
                        <p className="text-sm text-emerald-100/90 leading-relaxed">{selectedData.bd.strength}</p>
                      </div>
                    </div>
                  )}
                  {selectedData.bd.risk && (
                    <div className="bg-brand-pink-800/20 border border-brand-pink-800/40 p-4 rounded-xl flex items-start gap-3 shadow-[0_0_15px_rgba(218,26,132,0.15)]">
                      <AlertTriangle className="w-5 h-5 text-brand-pink-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-brand-pink-400 mb-1 block">Critical Risk</span>
                        <p className="text-sm text-brand-pink-100/90 leading-relaxed">{selectedData.bd.risk}</p>
                      </div>
                    </div>
                  )}
                  {!selectedData.bd.strength && !selectedData.bd.risk && selectedData.bd.insight && (
                    <div className="bg-surface/50 p-4 rounded-xl border border-border-subtle">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary mb-1 block">Insight</span>
                      <p className="text-sm text-text-primary leading-relaxed">{selectedData.bd.insight}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
