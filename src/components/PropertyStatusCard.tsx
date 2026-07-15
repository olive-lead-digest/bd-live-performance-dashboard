'use client';

import { useMemo } from 'react';
import { useDashboard } from '@/lib/DashboardContext';
import { LandPlot } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

// Property status = land status, sourced from deals.landStatus (analyst
// correction — the lead-level `prop` field is unpopulated org-wide, so this
// card now reads the real Zoho Deals land-status mix).
const STATUS_ORDER = ['Vacant Land', 'Operational', 'Under Construction', 'Unspecified'] as const;
const STATUS_COLORS: Record<string, string> = {
  'Vacant Land': '#da1a84',
  'Operational': '#34d399',
  'Under Construction': '#a470d6',
  'Unspecified': '#6b7280',
};
const BRANDS = ['Olive', 'Spark', 'Open Hotels'] as const;
const MAIN_PROPS = ['Vacant Land', 'Operational', 'Under Construction'] as const;

export function PropertyStatusCard() {
  const { dealsRuntime } = useDashboard();

  const { dist, total, brandMatrix } = useMemo(() => {
    const deals = dealsRuntime.deals;
    const ls: Record<string, number> = (deals?.landStatus as Record<string, number>) || {};
    const counts: Record<string, number> = {
      'Vacant Land': Number(ls['Vacant Land']) || 0,
      'Operational': Number(ls['Operational']) || 0,
      'Under Construction': Number(ls['Under Construction']) || 0,
      'Unspecified': Number(ls['Unspecified']) || 0,
    };
    const matrix: Record<string, Record<string, number>> = {};
    BRANDS.forEach(b => {
      matrix[b] = { 'Vacant Land': 0, 'Operational': 0, 'Under Construction': 0 };
    });

    const records: any[] = Array.isArray(deals?.records) ? deals.records : [];
    records.forEach(r => {
      const p = STATUS_ORDER.includes(r.landStatus) ? r.landStatus : 'Unspecified';
      const b = String(r.brand || '').trim();
      if (matrix[b] && (MAIN_PROPS as readonly string[]).includes(p)) {
        matrix[b][p] += 1;
      }
    });

    const t = STATUS_ORDER.reduce((s, k) => s + counts[k], 0);
    const d = STATUS_ORDER.map(name => ({ name, value: counts[name] }));
    return { dist: d, total: t, brandMatrix: matrix };
  }, [dealsRuntime]);

  if (!total) {
    return (
      <div className="glass-panel p-4 sm:p-6 flex flex-col">
        <div className="flex items-center gap-2 mb-4">
          <LandPlot className="w-4 h-4 text-brand-pink-500" />
          <h3 className="text-xs font-bold uppercase tracking-widest text-white">Property Status Mix</h3>
        </div>
        <p className="text-xs text-text-secondary">No property data for the current filters.</p>
      </div>
    );
  }

  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);
  const vacant = dist.find(d => d.name === 'Vacant Land')?.value || 0;
  const operational = dist.find(d => d.name === 'Operational')?.value || 0;

  return (
    <div className="glass-panel p-4 sm:p-6 flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <LandPlot className="w-4 h-4 text-brand-pink-500" />
        <h3 className="text-xs font-bold uppercase tracking-widest text-white">Property Status Mix</h3>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div
          className="w-full sm:w-40 h-40 shrink-0 relative"
          role="img"
          aria-label={`Property status mix of ${total.toLocaleString()} deals: ${dist.map(d => `${d.name} ${d.value.toLocaleString()} (${pct(d.value).toFixed(0)}%)`).join(', ')}.`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={dist}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={44}
                outerRadius={68}
                paddingAngle={2}
                stroke="none"
              >
                {dist.map(d => (
                  <Cell key={d.name} fill={STATUS_COLORS[d.name]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: '#1a1024', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                formatter={(value: any, name: any) => [`${Number(value).toLocaleString()} (${pct(Number(value)).toFixed(0)}%)`, name]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-lg font-black text-white leading-none">{total.toLocaleString()}</span>
            <span className="text-[9px] uppercase tracking-widest text-text-secondary">deals</span>
          </div>
        </div>

        <ul className="flex-1 space-y-1.5 min-w-0">
          {dist.map(d => (
            <li key={d.name} className="flex items-center gap-2 text-xs">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: STATUS_COLORS[d.name] }} />
              <span className="text-text-secondary truncate">{d.name}</span>
              <span className="ml-auto font-bold text-white whitespace-nowrap">{d.value.toLocaleString()}</span>
              <span className="text-text-secondary whitespace-nowrap w-10 text-right">{pct(d.value).toFixed(0)}%</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-[420px] sm:min-w-0 w-full text-xs">
          <thead>
            <tr className="text-text-secondary">
              <th className="text-left font-semibold pb-1.5 pr-2">Brand</th>
              {MAIN_PROPS.map(p => (
                <th key={p} className="text-right font-semibold pb-1.5 px-2 whitespace-nowrap">{p}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {BRANDS.map(b => (
              <tr key={b} className="border-t border-border-subtle/40">
                <td className="text-left py-1.5 pr-2 font-semibold text-white whitespace-nowrap">{b}</td>
                {MAIN_PROPS.map(p => (
                  <td key={p} className="text-right py-1.5 px-2 text-text-secondary">
                    {(brandMatrix[b]?.[p] || 0).toLocaleString()}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-text-secondary">
        Vacant land is <span className="text-brand-pink-500 font-bold">{pct(vacant).toFixed(0)}%</span> of pipeline — longer-cycle;
        operational <span className="text-emerald-400 font-bold">{pct(operational).toFixed(0)}%</span> converts fastest.
      </p>
    </div>
  );
}
