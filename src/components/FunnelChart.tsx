'use client';

import { isContacted } from '@/lib/utils';
import { Lead } from '@/lib/types';
import { useMemo } from 'react';
import { ArrowDown } from 'lucide-react';

// Overview conversion funnel (analyst correction):
//   Total Leads → Contacted → Active Deals → Signed
// Leads side comes from the filtered lead set; the deal side (Active Deals =
// open deals in Business Approval Received + Under Negotiation; Signed =
// MA-signed + Spark LOI) comes from the deals feed (dealsRuntime — honours the
// brand/region/etc. filters). Every consecutive conversion is capped at 100%.
export function FunnelChart({ leads, deals }: { leads: Lead[]; deals?: any }) {
  const { stages, conv } = useMemo(() => {
    const totalLeads = leads.length;
    const contacted = leads.filter((l) => isContacted(l.status)).length;

    const funnel: Array<{ stage: string; count: number }> = Array.isArray(deals?.funnel) ? deals.funnel : [];
    const stageCount = (name: string) => Number(funnel.find((f) => f.stage === name)?.count) || 0;

    // Active Deals = open deals in Business Approval Received + Under Negotiation.
    const activeDeals =
      Number(deals?.inProgress?.count) ||
      stageCount('Business Approval Received') + stageCount('Under Negotiation');
    // Signed = MA-signed + Spark LOI.
    const maSigned = stageCount('MA Signed') || Number(deals?.totals?.signed) || 0;
    const loiSigned = stageCount('LOI Signed') || Number(deals?.portfolio?.sparkLOI) || 0;
    const signed = maSigned + loiSigned;

    const stages = [
      { label: 'Total Leads', value: totalLeads, from: '#3f1f5c', to: '#5a3186' },
      { label: 'Contacted', value: contacted, from: '#8d2f7e', to: '#c2166f' },
      { label: 'Active Deals', value: activeDeals, from: '#7c46b3', to: '#a470d6' },
      { label: 'Signed', value: signed, from: '#da1a84', to: '#ff5cae' },
    ];
    const conv = totalLeads > 0 ? Math.min(100, (signed / totalLeads) * 100) : 0;
    return { stages, conv };
  }, [leads, deals]);

  const max = stages[0].value || 1;

  // P2-5 — accessible summary of the funnel for screen readers (the numeric
  // detail is also present as visible text and in the Overview KPI rail).
  const a11yLabel =
    'Conversion funnel: ' +
    stages.map((s) => `${s.label} ${s.value.toLocaleString('en-IN')}`).join(', ') +
    `. Lead-to-signed conversion ${conv.toFixed(2)} percent.`;

  return (
    <div className="w-full h-full flex flex-col justify-center" role="img" aria-label={a11yLabel}>
      <div className="flex flex-col">
        {stages.map((step, i) => {
          const prev = i > 0 ? stages[i - 1].value : null;
          // Conversion vs the previous stage, hard-capped at 100% (never >100).
          const advance = prev && prev > 0 ? Math.min(100, (step.value / prev) * 100) : null;
          const isLast = i === stages.length - 1;
          // Centered tapering width; keep a floor so labels stay legible.
          const width = Math.max(22, (step.value / max) * 100);

          return (
            <div key={step.label} className="flex flex-col">
              <div className="flex items-center gap-2 sm:gap-4">
                {/* Stage label */}
                <div className="w-20 sm:w-24 shrink-0 text-right">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-text-secondary leading-tight">
                    {step.label}
                  </div>
                </div>

                {/* Centered funnel segment */}
                <div className="flex-1 flex justify-center">
                  <div
                    className="relative h-12 rounded-xl flex items-center justify-center overflow-hidden transition-all duration-1000 ease-out"
                    style={{
                      width: `${width}%`,
                      background: `linear-gradient(135deg, ${step.from}, ${step.to})`,
                      boxShadow: isLast
                        ? `0 0 24px ${step.to}66, inset 0 1px 0 rgba(255,255,255,0.18)`
                        : `inset 0 1px 0 rgba(255,255,255,0.12)`,
                    }}
                  >
                    {/* glossy top sheen */}
                    <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/15 to-transparent pointer-events-none" />
                    <span className="relative text-white text-sm sm:text-base font-black tracking-tight z-10 drop-shadow">
                      {step.value.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                {/* Advance rate */}
                <div className="w-14 sm:w-20 shrink-0">
                  {advance !== null ? (
                    <span className="text-[11px] font-bold text-emerald-400">
                      {advance.toFixed(1)}%
                      <span className="block text-[9px] font-semibold uppercase tracking-wider text-text-secondary">
                        of prev
                      </span>
                    </span>
                  ) : (
                    <span className="text-[9px] font-semibold uppercase tracking-wider text-text-secondary">Top of funnel</span>
                  )}
                </div>
              </div>

              {/* Connector between stages */}
              {!isLast && (
                <div className="flex justify-center py-1">
                  <ArrowDown className="w-3.5 h-3.5 text-border-subtle" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary footer */}
      <div className="mt-6 pt-4 border-t border-border-subtle/60 flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-[9px] font-bold uppercase tracking-widest text-text-secondary">Lead → Signed Conversion</span>
          <span className="text-lg font-black text-brand-pink-400 leading-tight">{conv.toFixed(2)}%</span>
        </div>
        <div className="flex flex-col text-right">
          <span className="text-[9px] font-bold uppercase tracking-widest text-text-secondary">Signed</span>
          <span className="text-sm font-bold text-white leading-tight">
            {stages[3].value.toLocaleString('en-IN')} <span className="text-text-secondary font-medium">(MA + Spark LOI)</span>
          </span>
        </div>
      </div>
    </div>
  );
}
