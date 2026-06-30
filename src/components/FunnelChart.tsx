'use client';

import { calculateRates } from '@/lib/utils';
import { Lead } from '@/lib/types';
import { useMemo } from 'react';
import { ArrowDown } from 'lucide-react';

export function FunnelChart({ leads }: { leads: Lead[] }) {
  const { stages, rates } = useMemo(() => {
    const r = calculateRates(leads);
    const max = leads.length || 1;

    const stages = [
      { label: 'Total Leads', value: leads.length, from: '#3f1f5c', to: '#5a3186', pct: 100 },
      { label: 'Assigned', value: r.n, from: '#502875', to: '#7c46b3', pct: (r.n / max) * 100 },
      { label: 'Contacted', value: r.contacted, from: '#8d2f7e', to: '#c2166f', pct: (r.contacted / max) * 100 },
      { label: 'Active Deals', value: r.active, from: '#da1a84', to: '#ff5cae', pct: (r.active / max) * 100 },
    ];
    return { stages, rates: r };
  }, [leads]);

  const overall = leads.length ? (rates.active / leads.length) * 100 : 0;

  return (
    <div className="w-full h-full flex flex-col justify-center">
      <div className="flex flex-col">
        {stages.map((step, i) => {
          const prev = i > 0 ? stages[i - 1].value : null;
          const advance = prev && prev > 0 ? (step.value / prev) * 100 : null;
          const isLast = i === stages.length - 1;
          // Centered tapering width; keep a floor so labels stay legible.
          const width = Math.max(22, step.pct);

          return (
            <div key={step.label} className="flex flex-col">
              <div className="flex items-center gap-4">
                {/* Stage label */}
                <div className="w-24 shrink-0 text-right">
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
                    <span className="relative text-white text-base font-black tracking-tight z-10 drop-shadow">
                      {step.value.toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Advance rate */}
                <div className="w-20 shrink-0">
                  {advance !== null ? (
                    <span className="text-[11px] font-bold text-emerald-400">
                      {advance.toFixed(0)}%
                      <span className="block text-[9px] font-semibold uppercase tracking-wider text-text-secondary">advance</span>
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
          <span className="text-[9px] font-bold uppercase tracking-widest text-text-secondary">Lead → Deal Conversion</span>
          <span className="text-lg font-black text-brand-pink-400 leading-tight">{overall.toFixed(1)}%</span>
        </div>
        <div className="flex flex-col text-right">
          <span className="text-[9px] font-bold uppercase tracking-widest text-text-secondary">Dropped</span>
          <span className="text-sm font-bold text-white leading-tight">
            {rates.dropped.toLocaleString()} <span className="text-text-secondary font-medium">({rates.drop.toFixed(0)}%)</span>
          </span>
        </div>
      </div>
    </div>
  );
}
