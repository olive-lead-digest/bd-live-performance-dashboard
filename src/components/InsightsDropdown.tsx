'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { Lightbulb, ChevronDown, ChevronRight, Briefcase } from 'lucide-react';
import clsx from 'clsx';
import { InsightModal, InsightData } from './InsightModal';
import { useDashboard } from '@/lib/DashboardContext';
import { calculateRates, buildLeaderboard } from '@/lib/utils';

type InsightCategory = {
  name: string;
  insights: InsightData[];
};

const STAGE_ORDER = ['New Leads', 'Lead Contacted', 'Under Discussion', 'Awaiting Business Approval', 'Lead Dropped'];
const num = (n: number) => n.toLocaleString();

/*
 * Data-driven executive insights. Everything below is computed from the live
 * dashboard dataset (filtered leads + BD records). No hardcoded figures or rep
 * names — if the data is empty, the category is omitted.
 */
function useComputedInsights(): InsightCategory[] {
  const { data, filteredLeads } = useDashboard();

  return useMemo(() => {
    if (!data || !filteredLeads.length) return [];
    const total = filteredLeads.length;
    const rates = calculateRates(filteredLeads);

    // ---- Pipeline composition ----
    const sc: Record<string, number> = {};
    filteredLeads.forEach(l => { const s = l.status || '(unassigned)'; sc[s] = (sc[s] || 0) + 1; });
    const stageData = STAGE_ORDER.filter(s => sc[s]).map(s => ({ stage: s, count: sc[s] }));
    const topStage = [...stageData].sort((a, b) => b.count - a.count)[0];

    // ---- Regions ----
    const rc: Record<string, number> = {};
    filteredLeads.forEach(l => { const r = l.region || 'Unknown'; if (r !== 'Unknown') rc[r] = (rc[r] || 0) + 1; });
    const regionData = Object.entries(rc).map(([region, count]) => ({ region, count }))
      .sort((a, b) => b.count - a.count).slice(0, 6);

    // ---- Leaderboard ----
    const lb = buildLeaderboard(filteredLeads, data.bds, data.weights).filter(r => r.n > 0);
    const reviewed = lb.filter(r => r.reviewed && r.bps).sort((a, b) => (b.bps!.score) - (a.bps!.score));
    const coaching = lb.filter(r => r.band === 'Priority coaching').sort((a, b) => a.active - b.active);

    // ---- Data quality ----
    const unassigned = filteredLeads.filter(l => !l.owner).length;
    const unkRegion = filteredLeads.filter(l => l.region === 'Unknown').length;
    const noCity = filteredLeads.filter(l => !l.city || l.city === 'Other').length;
    const noQa = Object.keys(data.bds).filter(o => data.bds[o] && !data.bds[o].q).length;

    const cats: InsightCategory[] = [];

    // ===== Pipeline Health =====
    const pipeline: InsightData[] = [];
    if (stageData.length) {
      pipeline.push({
        id: 'stage-distribution',
        title: `Most leads sit in "${topStage.stage}" (${Math.round(topStage.count / total * 100)}%)`,
        implication: `Across ${num(total)} leads in view, the largest concentration is "${topStage.stage}" at ${num(topStage.count)}. Contact rate on assigned leads is ${rates.contact.toFixed(0)}% and active rate is ${rates.activeR.toFixed(0)}%.`,
        evidenceType: 'bar-chart',
        evidenceData: { xAxis: 'stage', bars: [{ key: 'count', color: '#da1a84' }], data: stageData },
      });
    }
    pipeline.push({
      id: 'drop-rate',
      title: `Drop rate at ${rates.drop.toFixed(1)}% of assigned leads`,
      implication: `${num(rates.dropped)} of ${num(rates.n)} assigned leads are marked dropped. ${num(rates.active)} remain in active conversation (${rates.activeR.toFixed(0)}%).`,
      evidenceType: 'alert-box',
      evidenceData: {
        title: `${rates.drop.toFixed(1)}% fall-out`,
        description: `Of ${num(rates.n)} assigned leads, ${num(rates.contacted)} were contacted, ${num(rates.active)} are active, and ${num(rates.dropped)} dropped.`,
      },
    });
    if (pipeline.length) cats.push({ name: 'Pipeline Health', insights: pipeline });

    // ===== Team Performance =====
    const team: InsightData[] = [];
    if (reviewed.length >= 2) {
      team.push({
        id: 'top-performers',
        title: 'Top performers by balanced score',
        implication: `${reviewed[0].owner} leads the balanced leaderboard at ${reviewed[0].bps!.score.toFixed(0)}/100 (${num(reviewed[0].n)} leads, ${reviewed[0].active.toFixed(0)}% active), ahead of ${reviewed[1].owner} at ${reviewed[1].bps!.score.toFixed(0)}/100.`,
        evidenceType: 'stat-cards',
        evidenceData: {
          cards: [
            { title: reviewed[0].owner, subtitle: `${num(reviewed[0].n)} leads`, value: reviewed[0].bps!.score.toFixed(0), suffix: '/100', icon: 'check', highlight: true },
            { title: reviewed[1].owner, subtitle: `${num(reviewed[1].n)} leads`, value: reviewed[1].bps!.score.toFixed(0), suffix: '/100', icon: 'chart', highlight: false },
          ],
        },
      });
    }
    if (coaching.length) {
      team.push({
        id: 'coaching-band',
        title: `${coaching.length} rep${coaching.length > 1 ? 's' : ''} in the Priority-Coaching band`,
        implication: `These reps fall in the lowest balanced-score band and would benefit most from coaching intervention.`,
        evidenceType: 'data-table',
        evidenceData: {
          columns: ['BD', 'Leads', 'Active %'],
          rows: coaching.slice(0, 6).map(r => [{ value: r.owner }, { value: num(r.n) }, { value: `${r.active.toFixed(0)}%`, color: r.active < 10 ? 'text-brand-pink-500 font-bold' : '' }]),
        },
      });
    }
    if (team.length) cats.push({ name: 'Team Performance', insights: team });

    // ===== Geography =====
    if (regionData.length) {
      cats.push({
        name: 'Geography',
        insights: [{
          id: 'region-volume',
          title: `${regionData[0].region} carries the most pipeline`,
          implication: `${regionData[0].region} leads regional volume with ${num(regionData[0].count)} leads (${Math.round(regionData[0].count / total * 100)}% of all leads in view).`,
          evidenceType: 'bar-chart',
          evidenceData: { xAxis: 'region', bars: [{ key: 'count', color: '#502875' }], data: regionData },
        }],
      });
    }

    // ===== Data Quality =====
    cats.push({
      name: 'Data Quality',
      insights: [{
        id: 'data-quality',
        title: 'Data capture & coverage gaps',
        implication: `${Math.round(unassigned / total * 100)}% of leads are unassigned, ${Math.round(unkRegion / total * 100)}% have no region, and ${Math.round(noCity / total * 100)}% have no city. ${noQa} BD${noQa === 1 ? '' : 's'} have no quality-review score.`,
        evidenceType: 'data-table',
        evidenceData: {
          columns: ['Gap', 'Count', 'Share'],
          rows: [
            [{ value: 'Unassigned leads' }, { value: num(unassigned) }, { value: `${Math.round(unassigned / total * 100)}%`, color: unassigned / total > 0.3 ? 'text-brand-pink-500 font-bold' : '' }],
            [{ value: 'Unknown region' }, { value: num(unkRegion) }, { value: `${Math.round(unkRegion / total * 100)}%`, color: unkRegion / total > 0.25 ? 'text-orange-400 font-bold' : '' }],
            [{ value: 'Missing city' }, { value: num(noCity) }, { value: `${Math.round(noCity / total * 100)}%`, color: noCity / total > 0.25 ? 'text-orange-400 font-bold' : '' }],
            [{ value: 'BDs without QA score' }, { value: num(noQa) }, { value: '—' }],
          ],
        },
      }],
    });

    return cats;
  }, [data, filteredLeads]);
}

export function InsightsDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedInsight, setSelectedInsight] = useState<InsightData | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<string[]>(['Pipeline Health']);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const CATEGORIES = useComputedInsights();
  const totalInsights = CATEGORIES.reduce((acc, c) => acc + c.insights.length, 0);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleCategory = (catName: string) => {
    setExpandedCategories(prev =>
      prev.includes(catName) ? prev.filter(c => c !== catName) : [...prev, catName]
    );
  };

  if (!totalInsights) return null;

  return (
    <>
      <div className="relative z-40" ref={dropdownRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-4 py-2 bg-brand-pink-500/10 hover:bg-brand-pink-500/20 border border-brand-pink-500/30 rounded-lg text-sm font-bold text-brand-pink-400 transition-colors shadow-[0_0_15px_rgba(218,26,132,0.15)]"
        >
          <Lightbulb className="w-4 h-4" />
          Executive Insights
          <ChevronDown className={clsx("w-4 h-4 transition-transform", isOpen && "rotate-180")} />
        </button>

        {isOpen && (
          <div className="absolute right-0 mt-2 w-[450px] max-w-[calc(100vw-2rem)] glass-panel border border-brand-pink-500/30 shadow-[0_10px_40px_rgba(218,26,132,0.2)] rounded-xl overflow-hidden animate-in fade-in slide-in-from-top-2 flex flex-col max-h-[600px]">
            <div className="p-4 bg-brand-pink-500/10 border-b border-brand-pink-500/20 flex justify-between items-center shrink-0">
              <span className="text-xs font-bold uppercase tracking-wider text-brand-pink-400 flex items-center gap-1.5"><Briefcase className="w-3.5 h-3.5"/> Strategic Briefings</span>
              <span className="text-[10px] font-bold text-text-secondary bg-surface px-2 py-0.5 rounded-full border border-border-subtle">{totalInsights} from live data</span>
            </div>

            <div className="overflow-y-auto no-scrollbar flex-1 p-2 flex flex-col gap-2">
              {CATEGORIES.map((cat) => {
                const isExpanded = expandedCategories.includes(cat.name);
                return (
                  <div key={cat.name} className="border border-border-subtle rounded-lg overflow-hidden bg-surface/30">
                    <button
                      onClick={() => toggleCategory(cat.name)}
                      className="w-full flex items-center justify-between p-3 hover:bg-surface/50 transition-colors"
                    >
                      <span className="text-sm font-bold text-white">{cat.name}</span>
                      <ChevronRight className={clsx("w-4 h-4 text-text-secondary transition-transform", isExpanded && "rotate-90")} />
                    </button>

                    {isExpanded && (
                      <div className="flex flex-col gap-1 p-2 bg-black/20 border-t border-border-subtle/50">
                        {cat.insights.map((item) => (
                          <button
                            key={item.id}
                            className="p-3 rounded-lg cursor-pointer transition-colors border text-left bg-transparent border-transparent hover:bg-brand-purple-900/20 hover:border-brand-purple-500/30 group"
                            onClick={() => {
                              setSelectedInsight(item);
                              setIsOpen(false);
                            }}
                          >
                            <div className="flex items-start gap-2">
                              <span className="text-xs font-bold text-brand-purple-400 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">View &rarr;</span>
                              <p className="text-sm font-medium text-text-primary leading-tight group-hover:text-white transition-colors">{item.title}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <InsightModal insight={selectedInsight} onClose={() => setSelectedInsight(null)} />
    </>
  );
}
