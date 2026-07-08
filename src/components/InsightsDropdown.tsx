'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { Lightbulb, ChevronDown, ChevronRight, Briefcase } from 'lucide-react';
import clsx from 'clsx';
import { InsightModal, InsightData } from './InsightModal';
import { useDashboard } from '@/lib/DashboardContext';
import { calculateRates, buildLeaderboard } from '@/lib/utils';
import { inr } from '@/lib/format';

type InsightCategory = {
  name: string;
  insights: InsightData[];
};

const STAGE_ORDER = ['New Leads', 'Lead Contacted', 'Under Discussion', 'Lead Dropped'];
const num = (n: number) => Math.round(n).toLocaleString('en-IN');
const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);
// Currency uses the shared Indian compact formatter (₹40K / ₹1.4L / ₹4.72Cr).

/*
 * CEO-grade executive insights. Every figure is computed live from the
 * dashboard dataset: filtered leads, BD leaderboard, and (when present) the
 * Zoho deals feed. No hardcoded figures or rep names — categories that lack
 * data are omitted, and all divisions are guarded against zero / null.
 */
function useComputedInsights(): InsightCategory[] {
  const { data, filteredLeads } = useDashboard();

  return useMemo(() => {
    if (!data || !filteredLeads.length) return [];
    const total = filteredLeads.length;
    const rates = calculateRates(filteredLeads);
    const deals = data.deals || null;
    const cats: InsightCategory[] = [];

    // ===== Signings & Revenue (only when the deals feed is present) =====
    if (deals && deals.totals) {
      const signings: InsightData[] = [];
      const t = deals.totals;
      const fees = deals.fees || {};
      const signRate = typeof t.signRatePct === 'number' ? t.signRatePct : pct(t.signed || 0, t.deals || 0);
      const dropRate = typeof t.dropRatePct === 'number' ? t.dropRatePct : pct(t.dropped || 0, t.deals || 0);

      signings.push({
        id: 'signings-headline',
        title: `${num(t.signed || 0)} deals signed at a ${signRate.toFixed(0)}% sign-rate`,
        implication: `Of ${num(t.deals || 0)} deals in the pipeline, ${num(t.signed || 0)} are signed (${signRate.toFixed(0)}%) and ${num(t.dropped || 0)} dropped (${dropRate.toFixed(0)}%). ${
          signRate >= 40 ? 'Conversion is healthy vs a typical 30-40% real-estate signing benchmark.' : 'Sign-rate trails the ~40% we would expect at healthy conversion — protect deals mid-funnel.'
        }${t.keysContracted ? ` ${num(t.keysContracted)} keys contracted.` : ''}`,
        evidenceType: 'alert-box',
        evidenceData: {
          title: `${num(t.signed || 0)} signed / ${num(t.deals || 0)} deals`,
          description: `Sign-rate ${signRate.toFixed(0)}%, drop-rate ${dropRate.toFixed(0)}%, active in pipeline ${num(t.active || 0)}.${t.keysContracted ? ` Keys contracted: ${num(t.keysContracted)}.` : ''}`,
        },
      });

      // Collections risk
      const contracted = Number(fees.contracted) || 0;
      const collected = Number(fees.collected) || 0;
      // P1-1: Zoho's Pending field is empty org-wide, so Receivable is DERIVED.
      const receivableAmt = Math.max(0, contracted - collected);
      if (contracted > 0) {
        const pendPct = pct(receivableAmt, contracted);
        signings.push({
          id: 'collections-risk',
          title: `${inr(contracted)} contracted — ${pendPct.toFixed(0)}% still receivable`,
          implication: `${inr(contracted)} of fees are contracted but only ${inr(collected)} (${pct(collected, contracted).toFixed(0)}%) is collected, leaving ${inr(receivableAmt)} (${pendPct.toFixed(0)}%) receivable (derived = Contracted − Collected; Zoho's Pending field is unpopulated). ${
            pendPct >= 50 ? 'Collections lag more than half of booked value — a cash-conversion risk that warrants a finance-led recovery push.' : 'Keep collections pacing ahead of new signings to avoid a receivables build-up.'
          }`,
          evidenceType: 'data-table',
          evidenceData: {
            columns: ['Fees', 'Amount', 'Share'],
            rows: [
              [{ value: 'Contracted' }, { value: inr(contracted) }, { value: '100%' }],
              [{ value: 'Collected' }, { value: inr(collected) }, { value: `${pct(collected, contracted).toFixed(0)}%`, color: 'text-emerald-400 font-bold' }],
              [{ value: 'Receivable' }, { value: inr(receivableAmt) }, { value: `${pendPct.toFixed(0)}%`, color: pendPct >= 40 ? 'text-brand-pink-500 font-bold' : 'text-orange-400 font-bold' }],
            ],
          },
        });
      }

      // Brand concentration of contracted fees
      const byBrand = deals.byBrand || {};
      const brandRows = Object.keys(byBrand).map(b => {
        const x = byBrand[b] || {};
        const fc = Number(x.feeContracted) || 0;
        const sg = Number(x.signed) || 0;
        return { brand: b, feeContracted: fc, signed: sg, perDeal: sg > 0 ? fc / sg : 0 };
      }).filter(r => r.feeContracted > 0);
      const totalBrandFee = brandRows.reduce((s, r) => s + r.feeContracted, 0);
      if (brandRows.length && totalBrandFee > 0) {
        const topFee = [...brandRows].sort((a, b) => b.feeContracted - a.feeContracted)[0];
        const topPerDeal = [...brandRows].sort((a, b) => b.perDeal - a.perDeal)[0];
        const share = pct(topFee.feeContracted, totalBrandFee);
        signings.push({
          id: 'brand-concentration',
          title: `${topFee.brand} = ${share.toFixed(0)}% of contracted fees`,
          implication: `${topFee.brand} accounts for ${inr(topFee.feeContracted)} (${share.toFixed(0)}%) of contracted fees from ${num(topFee.signed)} signing${topFee.signed === 1 ? '' : 's'}. ${topPerDeal.brand} carries the highest value-per-deal at ${inr(topPerDeal.perDeal)}/signing${topPerDeal.brand !== topFee.brand ? ` vs ${topFee.brand}'s ${inr(topFee.signed > 0 ? topFee.feeContracted / topFee.signed : 0)}` : ''}. ${share >= 50 ? 'Revenue is concentrated in one brand — diversify to de-risk.' : 'Fee mix is reasonably diversified across brands.'}`,
          evidenceType: 'data-table',
          evidenceData: {
            columns: ['Brand', 'Signed', 'Fee / deal'],
            rows: [...brandRows].sort((a, b) => b.feeContracted - a.feeContracted).slice(0, 4).map(r => [
              { value: r.brand },
              { value: num(r.signed) },
              { value: inr(r.perDeal), color: r.brand === topPerDeal.brand ? 'text-emerald-400 font-bold' : '' },
            ]),
          },
        });
      }

      if (signings.length) cats.push({ name: 'Signings & Revenue', insights: signings });
    }

    // ===== Pipeline Conversion (leakage) =====
    const pipeline: InsightData[] = [];
    // Funnel from lead statuses: assigned -> contacted -> active, with drop.
    const contactedLeak = 100 - rates.contact;      // assigned not yet contacted
    const activeLeak = rates.contact - rates.activeR; // contacted but not active
    const dropLeak = rates.drop;
    const leaks = [
      { label: 'Assigned → Contacted', gap: contactedLeak },
      { label: 'Contacted → Active', gap: activeLeak },
      { label: 'Fell out (Dropped)', gap: dropLeak },
    ].sort((a, b) => b.gap - a.gap);
    const worst = leaks[0];
    pipeline.push({
      id: 'funnel-leakage',
      title: `Biggest leakage: ${worst.label} (${worst.gap.toFixed(0)} pts)`,
      implication: `Across ${num(rates.n)} assigned leads, contact rate is ${rates.contact.toFixed(0)}% and active rate ${rates.activeR.toFixed(0)}%, with ${rates.drop.toFixed(0)}% dropped. The largest single loss is "${worst.label}" at ${worst.gap.toFixed(0)} points — the highest-leverage place to intervene to lift end-to-end conversion.`,
      evidenceType: 'data-table',
      evidenceData: {
        columns: ['Funnel step', 'Leakage (pts)', ''],
        rows: leaks.map(l => [
          { value: l.label },
          { value: `${l.gap.toFixed(0)}`, color: l === worst ? 'text-brand-pink-500 font-bold' : '' },
          { value: l === worst ? 'largest' : '' },
        ]),
      },
    });

    // Worst-drop brand vs company average
    const brandStats: Record<string, { n: number; drop: number }> = {};
    const brandGroups: Record<string, typeof filteredLeads> = {};
    filteredLeads.forEach(l => { const b = l.brand || 'Unknown'; (brandGroups[b] = brandGroups[b] || []).push(l); });
    Object.keys(brandGroups).forEach(b => {
      const r = calculateRates(brandGroups[b]);
      if (r.n >= 20) brandStats[b] = { n: r.n, drop: r.drop };
    });
    const brandDropArr = Object.entries(brandStats).map(([brand, s]) => ({ brand, ...s })).sort((a, b) => b.drop - a.drop);
    if (brandDropArr.length >= 2) {
      const worstBrand = brandDropArr[0];
      const gap = worstBrand.drop - rates.drop;
      pipeline.push({
        id: 'brand-drop-gap',
        title: `${worstBrand.brand} drops ${gap >= 0 ? '+' : ''}${gap.toFixed(0)} pts above company average`,
        implication: `${worstBrand.brand} drops ${worstBrand.drop.toFixed(0)}% of assigned leads vs the ${rates.drop.toFixed(0)}% company average — a ${Math.abs(gap).toFixed(0)}-point ${gap >= 0 ? 'gap worth diagnosing (positioning, pricing, or lead quality)' : 'advantage'}. Sample: ${num(worstBrand.n)} assigned leads.`,
        evidenceType: 'bar-chart',
        evidenceData: { xAxis: 'brand', bars: [{ key: 'drop', color: '#da1a84' }], data: brandDropArr.slice(0, 6).map(r => ({ brand: r.brand, drop: Math.round(r.drop) })) },
      });
    }
    if (pipeline.length) cats.push({ name: 'Pipeline Conversion', insights: pipeline });

    // ===== Team Performance =====
    const team: InsightData[] = [];
    const lb = buildLeaderboard(filteredLeads, data.bds, data.weights).filter(r => r.n > 0);
    const reviewed = lb.filter(r => r.reviewed && r.bps).sort((a, b) => (b.bps!.score) - (a.bps!.score));
    if (reviewed.length >= 2) {
      const scores = reviewed.map(r => r.bps!.score).sort((a, b) => a - b);
      const median = scores[Math.floor(scores.length / 2)];
      const topR = reviewed[0];
      const gap = topR.bps!.score - median;
      team.push({
        id: 'top-vs-median',
        title: `${topR.owner} leads at ${topR.bps!.score.toFixed(0)}/100 — ${gap.toFixed(0)} pts above median`,
        implication: `${topR.owner} tops the balanced leaderboard at ${topR.bps!.score.toFixed(0)}/100 (${num(topR.n)} leads, ${topR.active.toFixed(0)}% active), ${gap.toFixed(0)} points above the team median of ${median.toFixed(0)}. Codify their playbook; the spread signals uneven execution across the bench.`,
        evidenceType: 'stat-cards',
        evidenceData: {
          cards: [
            { title: topR.owner, subtitle: `${num(topR.n)} leads`, value: topR.bps!.score.toFixed(0), suffix: '/100', icon: 'check', highlight: true },
            { title: 'Team median', subtitle: `${reviewed.length} reviewed BDs`, value: median.toFixed(0), suffix: '/100', icon: 'chart', highlight: false },
          ],
        },
      });
    }
    const coaching = lb.filter(r => r.band === 'Priority coaching').sort((a, b) => a.active - b.active);
    if (coaching.length) {
      const avgActive = coaching.reduce((s, r) => s + r.active, 0) / coaching.length;
      team.push({
        id: 'coaching-band',
        title: `${coaching.length} rep${coaching.length > 1 ? 's' : ''} in Priority-Coaching, avg ${avgActive.toFixed(0)}% active`,
        implication: `${coaching.length} rep${coaching.length > 1 ? 's sit' : ' sits'} in the lowest score band, sharing a weak active-rate (avg ${avgActive.toFixed(0)}% vs company ${rates.activeR.toFixed(0)}%). Their common gap is converting contacted leads into live conversations — target coaching there for the fastest lift.`,
        evidenceType: 'data-table',
        evidenceData: {
          columns: ['BD', 'Leads', 'Active %'],
          rows: coaching.slice(0, 6).map(r => [{ value: r.owner }, { value: num(r.n) }, { value: `${r.active.toFixed(0)}%`, color: r.active < 10 ? 'text-brand-pink-500 font-bold' : '' }]),
        },
      });
    }
    // Best closer from deals feed
    if (deals && Array.isArray(deals.closers) && deals.closers.length) {
      const closers = [...deals.closers].filter((c: any) => c && (c.signed || c.feeContracted)).sort((a: any, b: any) => (b.signed || 0) - (a.signed || 0) || (b.feeContracted || 0) - (a.feeContracted || 0));
      if (closers.length) {
        const best = closers[0];
        team.push({
          id: 'best-closer',
          title: `Best closer: ${best.bd} (${num(best.signed || 0)} signed)`,
          implication: `${best.bd} leads on signings with ${num(best.signed || 0)} deals${best.feeContracted ? ` and ${inr(Number(best.feeContracted))} in contracted fees` : ''} — the strongest bottom-of-funnel converter. Pair developing reps with them on live deals.`,
          evidenceType: 'data-table',
          evidenceData: {
            columns: ['Closer', 'Signed', 'Fee contracted'],
            rows: closers.slice(0, 5).map((c: any) => [{ value: c.bd }, { value: num(c.signed || 0) }, { value: inr(Number(c.feeContracted) || 0) }]),
          },
        });
      }
    }
    if (team.length) cats.push({ name: 'Team Performance', insights: team });

    // ===== Momentum (month-over-month) =====
    const byMonth: Record<string, typeof filteredLeads> = {};
    filteredLeads.forEach(l => { const mo = (l.dt || '').slice(0, 7); if (mo) (byMonth[mo] = byMonth[mo] || []).push(l); });
    const months = Object.keys(byMonth).sort();
    if (months.length >= 2) {
      const curr = months[months.length - 1];
      const prev = months[months.length - 2];
      const cV = byMonth[curr].length;
      const pV = byMonth[prev].length;
      const volDelta = pct(cV - pV, pV);
      const cActive = calculateRates(byMonth[curr]).activeR;
      const pActive = calculateRates(byMonth[prev]).activeR;
      const actDelta = cActive - pActive;
      const entryLag = cV < pV * 0.6; // sharp volume drop in latest month often = capture lag
      const momentum: InsightData[] = [{
        id: 'mom-volume',
        title: `Lead volume ${volDelta >= 0 ? 'up' : 'down'} ${Math.abs(volDelta).toFixed(0)}% MoM${entryLag ? ' (likely entry-lag)' : ''}`,
        implication: `${curr} logged ${num(cV)} leads vs ${num(pV)} in ${prev} (${volDelta >= 0 ? '+' : ''}${volDelta.toFixed(0)}%), and active-rate moved ${actDelta >= 0 ? '+' : ''}${actDelta.toFixed(0)} pts (${pActive.toFixed(0)}% → ${cActive.toFixed(0)}%). ${entryLag ? 'The steep volume drop in the newest month likely reflects CRM entry-lag rather than a real slowdown — confirm before acting.' : volDelta >= 0 ? 'Momentum is positive; sustain top-of-funnel supply.' : 'Volume is softening — check lead-gen inputs.'}`,
        evidenceType: 'bar-chart',
        evidenceData: { xAxis: 'month', bars: [{ key: 'leads', color: '#502875' }], data: months.slice(-6).map(m => ({ month: m, leads: byMonth[m].length })) },
      }];
      cats.push({ name: 'Momentum', insights: momentum });
    }

    // ===== Data Quality (only if materially high) =====
    const unassigned = filteredLeads.filter(l => !l.owner).length;
    const unkRegion = filteredLeads.filter(l => l.region === 'Unknown').length;
    const unaP = pct(unassigned, total);
    const unrP = pct(unkRegion, total);
    if (unaP >= 15 || unrP >= 20) {
      cats.push({
        name: 'Data Quality',
        insights: [{
          id: 'data-quality',
          title: `Coverage gaps: ${unaP.toFixed(0)}% unassigned, ${unrP.toFixed(0)}% no region`,
          implication: `${unaP.toFixed(0)}% of leads are unassigned and ${unrP.toFixed(0)}% carry no region — high enough to bias ownership and geographic reads. Tighten capture at intake so the funnel and territory numbers stay trustworthy.`,
          evidenceType: 'alert-box',
          evidenceData: {
            title: `${num(unassigned)} unassigned · ${num(unkRegion)} no-region`,
            description: `Out of ${num(total)} leads in view. Above the ~15% threshold where gaps start distorting attribution.`,
          },
        }],
      });
    }

    return cats;
  }, [data, filteredLeads]);
}

export function InsightsDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedInsight, setSelectedInsight] = useState<InsightData | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<string[]>(['Signings & Revenue', 'Pipeline Conversion']);
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
