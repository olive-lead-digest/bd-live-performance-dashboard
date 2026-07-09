'use client';

import { useDashboard } from '@/lib/DashboardContext';
import { calculateRates, isActive, ESTIMATED_DEAL_VALUE } from '@/lib/utils';
import { useState, useMemo } from 'react';
import clsx from 'clsx';
import { SplitSquareHorizontal, Trophy, Plus, Minus } from 'lucide-react';
import { ExecSummary, SummaryBullet } from '@/components/ExecSummary';
import { compactNum } from '@/lib/format';

// Illustrative estimate only — leads carry no monetary amount (see utils.ts).
const AVG_DEAL_SIZE = ESTIMATED_DEAL_VALUE;

// P1-2: shared Indian compact scale (K/L/Cr, never T/M/B). Callers prefix ₹.
const formatCurrency = (num: number) => compactNum(num);

type FilterSelection = { type: string, value: string };
type CohortState = { primary: FilterSelection, secondary: FilterSelection };

export default function Compare() {
  const { filteredLeads, data, isLoading } = useDashboard();
  
  const [showThird, setShowThird] = useState(false);
  const [sideA, setSideA] = useState<CohortState>({ primary: { type: 'brand', value: 'Spark' }, secondary: { type: 'none', value: 'All' } });
  const [sideB, setSideB] = useState<CohortState>({ primary: { type: 'brand', value: 'Open Hotels' }, secondary: { type: 'none', value: 'All' } });
  const [sideC, setSideC] = useState<CohortState>({ primary: { type: 'brand', value: 'Olive' }, secondary: { type: 'none', value: 'All' } });

  const comparisonOptions = useMemo(() => {
    const brands = new Set<string>();
    const regions = new Set<string>();
    const clusters = new Set<string>();
    const tiers = new Set<string>();
    
    filteredLeads.forEach(l => {
      if (l.brand && l.brand !== 'Unknown' && l.brand !== '(none)') brands.add(l.brand);
      if (l.region && l.region !== 'Unknown' && l.region !== '(none)') regions.add(l.region);
      if (l.cluster && l.cluster !== 'Unknown' && l.cluster !== '(none)') clusters.add(l.cluster);
      if (l.tier && l.tier !== 'Unknown' && l.tier !== '(none)') tiers.add(l.tier);
    });

    return {
      brands: Array.from(brands).sort(),
      regions: Array.from(regions).sort(),
      clusters: Array.from(clusters).sort(),
      tiers: Array.from(tiers).sort()
    };
  }, [filteredLeads]);

  const calcEntityStats = (cohort: CohortState) => {
    const leads = filteredLeads.filter(l => {
      const applyFilter = (f: FilterSelection) => {
        if (f.type === 'none' || f.value === 'All') return true;
        if (f.type === 'brand') return l.brand && l.brand.toLowerCase() === f.value.toLowerCase();
        if (f.type === 'region') return l.region && l.region.toLowerCase() === f.value.toLowerCase();
        if (f.type === 'cluster') return l.cluster && l.cluster.toLowerCase() === f.value.toLowerCase();
        if (f.type === 'tier') return l.tier && l.tier.toLowerCase() === f.value.toLowerCase();
        return true;
      };
      
      return applyFilter(cohort.primary) && applyFilter(cohort.secondary);
    });

    const rates = calculateRates(leads);
    const pipelineValue = leads.length * AVG_DEAL_SIZE;
    const securedRevenue = rates.active * AVG_DEAL_SIZE;
    // "winRate" identifier kept for stability, but this is the real contact rate (contacted / assigned).
    const winRate = rates.contact;
    const contactRate = leads.length > 0 ? (rates.n / leads.length) * 100 : 0;
    const yieldPerLead = leads.length > 0 ? securedRevenue / leads.length : 0;
    
    let highIntentCount = 0;
    let ciCount = 0;
    let tier1Count = 0;
    const owners = new Set<string>();

    leads.forEach(l => {
      const s = l.status;
      if (isActive(s)) highIntentCount++; // active conversation = highest real intent in this pipeline
      if (l.ci) ciCount++;
      if (l.tier === 'Tier 1') tier1Count++;
      if (l.owner) owners.add(l.owner);
    });

    const highIntentRate = leads.length > 0 ? (highIntentCount / leads.length) * 100 : 0;
    const ciExposure = leads.length > 0 ? (ciCount / leads.length) * 100 : 0;
    const tier1Concentration = leads.length > 0 ? (tier1Count / leads.length) * 100 : 0;

    const bds = data?.bds || {};
    let totalQ = 0;
    let validQ = 0;
    owners.forEach(o => {
      const q = bds[o]?.q;
      if (q) {
        totalQ += q.overall * 10;
        validQ++;
      }
    });
    const avgTeamScore = validQ > 0 ? totalQ / validQ : 0;

    return {
      leads: leads.length,
      pipelineValue,
      securedRevenue,
      winRate,
      contactRate,
      yieldPerLead,
      highIntentRate,
      ciExposure,
      tier1Concentration,
      avgTeamScore
    };
  };

  const statsA = useMemo(() => calcEntityStats(sideA), [sideA, filteredLeads]);
  const statsB = useMemo(() => calcEntityStats(sideB), [sideB, filteredLeads]);
  const statsC = useMemo(() => calcEntityStats(sideC), [sideC, filteredLeads]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-80px)]">
        <div className="w-12 h-12 border-4 border-brand-purple-500/20 border-t-brand-pink-500 rounded-full animate-spin" />
      </div>
    );
  }

  type MetricKey = keyof ReturnType<typeof calcEntityStats>;

  const getWinner = (key: MetricKey, reverseLogic = false) => {
    let vals = [
      { id: 'A', val: statsA[key] },
      { id: 'B', val: statsB[key] },
    ];
    if (showThird) vals.push({ id: 'C', val: statsC[key] });
    
    // Sort descending by default
    vals.sort((a, b) => b.val - a.val);
    
    if (reverseLogic) {
      // Smallest value wins
      vals.sort((a, b) => a.val - b.val);
    }

    // If all are 0 or there's a tie for first, no winner
    if (vals[0].val === 0 || vals[0].val === vals[1].val) return null;

    return vals[0].id as 'A' | 'B' | 'C';
  };

  const calculateOverallWinner = () => {
    const scores = { A: 0, B: 0, C: 0 };
    const metrics: { key: MetricKey, reverse: boolean }[] = [
      { key: 'securedRevenue', reverse: false },
      { key: 'pipelineValue', reverse: false },
      { key: 'yieldPerLead', reverse: false },
      { key: 'highIntentRate', reverse: false },
      { key: 'tier1Concentration', reverse: false },
      { key: 'winRate', reverse: false },
      { key: 'leads', reverse: false },
      { key: 'avgTeamScore', reverse: false },
      { key: 'ciExposure', reverse: true },
    ];

    metrics.forEach(m => {
      const w = getWinner(m.key, m.reverse);
      if (w) scores[w]++;
    });

    let topScore = 0;
    let winnerId: 'A' | 'B' | 'C' | null = null;
    let isTie = false;

    (['A', 'B', 'C'] as const).forEach(id => {
      if (!showThird && id === 'C') return;
      if (scores[id] > topScore) {
        topScore = scores[id];
        winnerId = id;
        isTie = false;
      } else if (scores[id] === topScore) {
        isTie = true;
      }
    });

    return { scores, winnerId: isTie ? null : winnerId, topScore };
  };

  const getSharedDimension = () => {
    const cohorts = [sideA, sideB];
    if (showThird) cohorts.push(sideC);

    const cohortDims = cohorts.map(c => {
       const dims = [];
       if (c.primary.type !== 'none' && c.primary.value !== 'All') dims.push(`${c.primary.type}:${c.primary.value}`);
       if (c.secondary.type !== 'none' && c.secondary.value !== 'All') dims.push(`${c.secondary.type}:${c.secondary.value}`);
       return dims;
    });

    if (cohortDims.some(d => d.length === 0)) return null; // If any cohort is entirely "All", ignore

    const intersection = cohortDims[0].filter(d => cohortDims.every(cd => cd.includes(d)));
    if (intersection.length > 0) {
      return intersection[0].split(':')[1];
    }
    return null;
  };

  const renderDropdownOptions = () => (
    <>
      <optgroup label="Brands">
        {comparisonOptions.brands.map(b => <option key={`brand:${b}`} value={`brand:${b}`}>{b}</option>)}
      </optgroup>
      <optgroup label="Regions">
        {comparisonOptions.regions.map(r => <option key={`region:${r}`} value={`region:${r}`}>{r}</option>)}
      </optgroup>
      <optgroup label="Clusters">
        {comparisonOptions.clusters.map(c => <option key={`cluster:${c}`} value={`cluster:${c}`}>{c}</option>)}
      </optgroup>
      <optgroup label="Tiers">
        {comparisonOptions.tiers.map(t => <option key={`tier:${t}`} value={`tier:${t}`}>{t}</option>)}
      </optgroup>
    </>
  );

  const renderCohortColumn = (
    title: string,
    colorCode: string,
    cohortId: 'A' | 'B' | 'C',
    state: CohortState,
    setter: React.Dispatch<React.SetStateAction<CohortState>>,
    stats: ReturnType<typeof calcEntityStats>
  ) => {
    
    const renderMetricBox = (label: string, key: MetricKey, format: (v: number) => string, prefix = '', suffix = '', reverseLogic = false) => {
      const winner = getWinner(key, reverseLogic);
      const isWinner = winner === cohortId;
      const val = stats[key];

      return (
        <div className={clsx(
          "flex justify-between items-center py-2.5 px-4 border-b border-border-subtle/30 transition-colors",
          isWinner ? "bg-surface/60" : "hover:bg-surface/30"
        )}>
          <span className="text-[10px] uppercase font-bold tracking-widest text-text-secondary">{label}</span>
          <div className="flex items-center gap-2">
             <span className={clsx(
               "text-base lg:text-lg font-black tracking-tight",
               isWinner ? colorCode : "text-white"
             )}>
               {prefix}{format(val)}{suffix}
             </span>
             {isWinner && <Trophy className={clsx("w-3 h-3", colorCode)} />}
          </div>
        </div>
      );
    };

    return (
      <div className="flex flex-col h-full border-r border-border-subtle/50 last:border-0 relative">
        {/* Dynamic header strip */}
        <div className={clsx("absolute top-0 left-0 w-full h-1", {
          "bg-brand-pink-500 shadow-[0_0_10px_rgba(218,26,132,0.8)]": cohortId === 'A',
          "bg-brand-purple-500 shadow-[0_0_10px_rgba(80,40,117,0.8)]": cohortId === 'B',
          "bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)]": cohortId === 'C',
        })} />
        
        {/* Selectors Header */}
        <div className="p-4 pt-6 bg-black/40 border-b border-border-subtle/50 shrink-0">
          <div className="flex items-center justify-between mb-3">
             <span className="text-xs uppercase font-bold tracking-widest text-white flex items-center gap-2">
               <div className={clsx("w-2 h-2 rounded-full", {
                 "bg-brand-pink-500": cohortId === 'A',
                 "bg-brand-purple-500": cohortId === 'B',
                 "bg-blue-500": cohortId === 'C',
               })} />
               {title}
             </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
             <div className="flex flex-col gap-1">
               <span className="text-[9px] font-bold text-text-secondary uppercase px-1">Primary Entity</span>
               <select 
                  value={`${state.primary.type}:${state.primary.value}`} 
                  onChange={e => {
                    const [type, value] = e.target.value.split(':');
                    setter({...state, primary: { type, value }});
                  }} 
                  className="bg-surface border border-border-subtle rounded px-2 py-2 text-xs text-white font-bold outline-none focus:border-brand-pink-500/50"
               >
                  {renderDropdownOptions()}
               </select>
             </div>
             <div className="flex flex-col gap-1">
               <span className="text-[9px] font-bold text-text-secondary uppercase px-1">Cross-Reference (Optional)</span>
               <select 
                  value={`${state.secondary.type}:${state.secondary.value}`} 
                  onChange={e => {
                    const [type, value] = e.target.value.split(':');
                    setter({...state, secondary: { type, value }});
                  }} 
                  className="bg-surface border border-border-subtle rounded px-2 py-2 text-xs text-white font-semibold outline-none focus:border-brand-pink-500/50 text-text-secondary focus:text-white"
               >
                  <option value="none:All">No Cross-Reference</option>
                  {renderDropdownOptions()}
               </select>
             </div>
          </div>
        </div>

        {/* Metrics Body */}
        <div className="flex-1 overflow-y-auto no-scrollbar pb-6 pt-2">
          {renderMetricBox("Est. Active Value", "securedRevenue", v => formatCurrency(v), "₹")}
          {renderMetricBox("Est. Pipeline Value", "pipelineValue", v => formatCurrency(v), "₹")}
          {renderMetricBox("Est. Yield per Lead", "yieldPerLead", v => formatCurrency(v), "₹")}
          {renderMetricBox("Active Rate", "highIntentRate", v => v.toFixed(1), "", "%")}
          {renderMetricBox("Tier 1 Concentration", "tier1Concentration", v => v.toFixed(1), "", "%")}
          {renderMetricBox("Contact Rate", "winRate", v => v.toFixed(1), "", "%")}
          {renderMetricBox("Gross Lead Volume", "leads", v => v.toLocaleString())}
          {renderMetricBox("Avg Team Score", "avgTeamScore", v => Math.round(v).toString())}
          {renderMetricBox("Competitor Exposure", "ciExposure", v => v.toFixed(1), "", "%", true)}
        </div>
      </div>
    );
  };

  const labelOf = (st: CohortState, id: string) => (st.primary.value && st.primary.value !== 'All') ? st.primary.value : `Cohort ${id}`;
  const lblA = labelOf(sideA, 'A'), lblB = labelOf(sideB, 'B'), lblC = labelOf(sideC, 'C');
  // P2-6 — label the (defaulted) cohorts by the entity they actually resolve to,
  // so a viewer sees "Cohort A · Spark" rather than an unexplained "Cohort A".
  const titleFor = (lbl: string, id: string) => (lbl && lbl !== `Cohort ${id}`) ? `Cohort ${id} · ${lbl}` : `Cohort ${id}`;
  const overallSummary = calculateOverallWinner();
  const winLbl = overallSummary.winnerId === 'A' ? lblA : overallSummary.winnerId === 'B' ? lblB : overallSummary.winnerId === 'C' ? lblC : null;
  const rank = (pick: (s: ReturnType<typeof calcEntityStats>) => number) => {
    const arr = [{ l: lblA, v: pick(statsA) }, { l: lblB, v: pick(statsB) }];
    if (showThird) arr.push({ l: lblC, v: pick(statsC) });
    return arr.sort((a, b) => b.v - a.v);
  };
  const revRank = rank(s => s.securedRevenue);
  const wrRank = rank(s => s.winRate);
  const ciRank = rank(s => s.ciExposure);
  const summaryBullets: SummaryBullet[] = [
    winLbl
      ? { tone: 'up', text: `${winLbl} leads overall, winning ${overallSummary.topScore} of 9 metrics.` }
      : { tone: 'info', text: `No clear winner — ${lblA} wins ${overallSummary.scores.A} of 9 metrics and ${lblB} wins ${overallSummary.scores.B}${showThird ? `, ${lblC} ${overallSummary.scores.C}` : ''} (the remainder are exact ties).` },
    { tone: 'info', text: `Highest est. active value: ${revRank[0].l} at ₹${formatCurrency(revRank[0].v)}.` },
    { tone: 'info', text: `Best contact rate: ${wrRank[0].l} (${wrRank[0].v.toFixed(1)}%).` },
    ...(ciRank[0].v > 0 ? [{ tone: 'warn' as const, text: `${ciRank[0].l} carries the highest competitor exposure (${ciRank[0].v.toFixed(1)}%).` }] : []),
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] overflow-hidden relative px-4 pt-2">
      <div className="absolute top-[-100px] left-[20%] w-[800px] h-[400px] bg-brand-purple-500/10 rounded-full blur-[150px] pointer-events-none" />

      {/* Header */}
      <header className="shrink-0 relative z-10 flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-pink-500/20 to-brand-purple-500/20 border border-brand-purple-500/30 flex items-center justify-center shadow-[0_0_20px_rgba(80,40,117,0.3)]">
            <SplitSquareHorizontal className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white tracking-tight leading-none">Matrix Split View</h1>
            <p className="text-text-secondary text-[10px] mt-1">Cross-reference up to 3 cohorts structurally.</p>
          </div>
        </div>
        
        <button 
          onClick={() => setShowThird(!showThird)}
          className={clsx(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border",
            showThird ? "bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500/30" : "bg-blue-500/20 text-blue-400 border-blue-500/30 hover:bg-blue-500/30"
          )}
        >
          {showThird ? <Minus className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
          {showThird ? "Remove Cohort C" : "Add Cohort C"}
        </button>
      </header>

      <div className="shrink-0">
        <ExecSummary bullets={summaryBullets} />
      </div>

      {/* Shared Dimension Showdown Banner */}
      {(() => {
         const sharedDim = getSharedDimension();
         const overall = calculateOverallWinner();
         if (!sharedDim) return null;
         
         return (
           <div className="glass-card mb-4 p-4 border border-brand-purple-500/30 flex items-center justify-between shrink-0 shadow-[0_0_20px_rgba(80,40,117,0.2)]">
              <div className="flex items-center gap-3">
                 <div className="w-10 h-10 rounded-full bg-brand-purple-500/20 flex items-center justify-center border border-brand-purple-500/30">
                   <Trophy className="w-5 h-5 text-brand-purple-400" />
                 </div>
                 <div>
                   <h2 className="text-sm font-bold text-white uppercase tracking-wider">{sharedDim} Showdown</h2>
                   <p className="text-[10px] text-text-secondary uppercase tracking-widest">Cross-Cohort Dominance</p>
                 </div>
              </div>
              
              {overall.winnerId ? (
                <div className="text-right">
                  <span className="text-[10px] text-text-secondary uppercase tracking-widest font-bold block mb-0.5">Overall Winner</span>
                  <div className={clsx(
                    "text-lg font-black tracking-tight",
                    overall.winnerId === 'A' ? "text-brand-pink-400" : overall.winnerId === 'B' ? "text-brand-purple-400" : "text-blue-400"
                  )}>
                    Cohort {overall.winnerId} <span className="text-xs font-normal text-text-secondary ml-1">({overall.topScore} of 9 metrics)</span>
                  </div>
                </div>
              ) : (
                 <div className="text-right">
                  <span className="text-[10px] text-text-secondary uppercase tracking-widest font-bold block mb-0.5">Metric split</span>
                  <div className="text-lg font-black text-white tracking-tight">No clear winner</div>
                  <div className="text-[11px] text-text-secondary tracking-normal font-normal mt-0.5">
                    {lblA} {overall.scores.A} · {lblB} {overall.scores.B}{showThird ? ` · ${lblC} ${overall.scores.C}` : ''} of 9
                  </div>
                </div>
              )}
           </div>
         );
      })()}

      {/* Dynamic Columns Area */}
      <div className="flex-1 min-h-0 relative z-10 pb-4">
        <div className="glass-card h-full w-full overflow-x-auto lg:overflow-hidden no-scrollbar flex border border-border-subtle/50">
          
          <div className={clsx("h-full transition-all duration-500 min-w-[82%] sm:min-w-[340px] lg:min-w-0", showThird ? "lg:w-1/3" : "lg:w-1/2")}>
             {renderCohortColumn(titleFor(lblA, 'A'), "text-brand-pink-400", 'A', sideA, setSideA, statsA)}
          </div>
          
          <div className={clsx("h-full transition-all duration-500 min-w-[82%] sm:min-w-[340px] lg:min-w-0", showThird ? "lg:w-1/3" : "lg:w-1/2")}>
             {renderCohortColumn(titleFor(lblB, 'B'), "text-brand-purple-400", 'B', sideB, setSideB, statsB)}
          </div>
          
          {showThird && (
            <div className="h-full min-w-[82%] sm:min-w-[340px] lg:min-w-0 lg:w-1/3 transition-all duration-500 border-l border-border-subtle/50">
               {renderCohortColumn(titleFor(lblC, 'C'), "text-blue-400", 'C', sideC, setSideC, statsC)}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
