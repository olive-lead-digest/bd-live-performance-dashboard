'use client';

import { useMemo, useState } from 'react';
import { useDashboard } from '@/lib/DashboardContext';
import { Building2, Handshake, IndianRupee } from 'lucide-react';
import { inr, num, brandColor } from '@/lib/format';
import { DealsExemptBadge, useDealsExempt } from '@/components/DataBadges';
import { CsvButton } from '@/components/CsvButton';

type Split = Record<string, number>;

interface FiscalPeriod {
  signings?: { count?: number; byBrand?: Split; byRegion?: Split };
  collections?: { amount?: number; byBrand?: Split; byRegion?: Split; approx?: boolean };
}

const PORTFOLIO_TILES: { key: string; label: string; sub: string; color: string }[] = [
  { key: 'oliveMA', label: 'Olive', sub: 'MAs signed', color: '#502875' },
  { key: 'sparkMA', label: 'Spark', sub: 'MAs signed', color: '#da1a84' },
  { key: 'openMA', label: 'Open Hotels', sub: 'MAs signed', color: '#a470d6' },
  { key: 'sparkLOI', label: 'Spark', sub: 'LOIs signed', color: '#ec4899' },
];

function SplitBars({
  data,
  colorFor,
  money,
}: {
  data: Split;
  colorFor: (k: string) => string;
  money?: boolean;
}) {
  const rows = Object.entries(data || {})
    .map(([name, v]) => ({ name, v: Number(v) || 0 }))
    .filter((r) => r.v > 0)
    .sort((a, b) => b.v - a.v);
  if (rows.length === 0) {
    return <div className="text-[11px] text-text-secondary italic py-2">No data this period.</div>;
  }
  const max = Math.max(1, ...rows.map((r) => r.v));
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <div key={r.name}>
          <div className="flex items-center justify-between text-[11px] mb-1 gap-2">
            <span className="text-text-secondary font-medium truncate pr-2">{r.name}</span>
            <span className="text-white font-bold tabular-nums shrink-0">
              {money ? inr(r.v) : num(r.v)}
            </span>
          </div>
          <div className="w-full h-2 bg-surface rounded-full overflow-hidden shadow-[inset_0_1px_3px_rgba(0,0,0,0.4)]">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${Math.max(4, (r.v / max) * 100)}%`, backgroundColor: colorFor(r.name) }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function PortfolioFiscalCard() {
  const { dealsRuntime, filters } = useDashboard();
  const deals = dealsRuntime.deals;
  const exempt = useDealsExempt();
  const [period, setPeriod] = useState<'mtd' | 'ytd'>('ytd');

  const portfolio = deals?.portfolio as Record<string, number> | undefined;
  const mtd = deals?.mtd as FiscalPeriod | undefined;
  const ytd = deals?.ytd as FiscalPeriod | undefined;

  const active: FiscalPeriod | undefined = period === 'mtd' ? mtd : ytd;

  const asOf = useMemo(() => {
    const p: any = period === 'mtd' ? mtd : ytd;
    return p?.asOf || p?.period || p?.start || null;
  }, [period, mtd, ytd]);

  if (!portfolio && !mtd && !ytd) return null;

  return (
    <div className="flex flex-col gap-4 sm:gap-6 relative z-10">
      {/* Portfolio KPI tiles */}
      {portfolio && (
        <div className={'glass-panel p-4 sm:p-6 transition-opacity ' + (exempt ? 'opacity-80' : '')}>
          <div className="flex items-center justify-between gap-2 mb-5 flex-wrap">
            <h2 className="text-xs font-bold uppercase tracking-widest text-white flex items-center gap-2">
              <Building2 className="w-4 h-4 text-brand-pink-400" /> Signed Portfolio
            </h2>
            <div className="flex items-center gap-2">
              <DealsExemptBadge />
              <CsvButton
                base="portfolio-signed"
                filters={filters}
                columns={[
                  { key: 'label', label: 'Segment' },
                  { key: 'value', label: 'Count' },
                ]}
                rows={PORTFOLIO_TILES.map((t) => ({ label: `${t.label} — ${t.sub}`, value: portfolio?.[t.key] ?? 0 }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {PORTFOLIO_TILES.map((t) => (
              <div
                key={t.key + t.sub}
                className="relative overflow-hidden rounded-xl p-4 border border-border-subtle/60 bg-black/20 flex flex-col gap-1"
              >
                <div
                  className="absolute top-0 right-0 w-20 h-20 rounded-full blur-[30px] -mr-6 -mt-6 opacity-25 pointer-events-none"
                  style={{ backgroundColor: t.color }}
                />
                <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary relative z-10">
                  {t.label}
                </span>
                <span className="text-3xl font-black tabular-nums text-white relative z-10">
                  {num(portfolio[t.key] ?? 0)}
                </span>
                <span className="text-[10px] uppercase tracking-wider font-bold relative z-10" style={{ color: t.color }}>
                  {t.sub}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fiscal signings & collections */}
      {active && (
        <div className={'glass-panel p-4 sm:p-6 transition-opacity ' + (exempt ? 'opacity-80' : '')}>
          <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
            <h2 className="text-xs font-bold uppercase tracking-widest text-white flex items-center gap-2">
              <Handshake className="w-4 h-4 text-brand-pink-400" /> Signings &amp; Collections
            </h2>
            <DealsExemptBadge />
            <CsvButton
              base={`portfolio-${period}`}
              filters={filters}
              columns={[
                { key: 'dimension', label: 'Dimension' },
                { key: 'group', label: 'Group' },
                { key: 'signings', label: 'Signings' },
                { key: 'collections', label: 'Collections' },
              ]}
              rows={[
                ...Object.entries(active.signings?.byRegion || {}).map(([k, v]) => ({ dimension: 'Region', group: k, signings: v, collections: (active.collections?.byRegion || {})[k] ?? '' })),
                ...Object.entries(active.signings?.byBrand || {}).map(([k, v]) => ({ dimension: 'Brand', group: k, signings: v, collections: (active.collections?.byBrand || {})[k] ?? '' })),
              ]}
            />
            <div className="flex bg-black/40 p-1 rounded-lg border border-border-subtle/50">
              {(['mtd', 'ytd'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={
                    'px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all ' +
                    (period === p
                      ? 'bg-brand-pink-500 text-white shadow-[0_0_10px_rgba(218,26,132,0.4)]'
                      : 'text-text-secondary hover:text-white')
                  }
                >
                  {p === 'mtd' ? 'This Month' : 'FY To-Date'}
                </button>
              ))}
            </div>
          </div>

          {/* Totals — with an explanatory empty state when the current month
              has no signings yet (P1-3), instead of a bare "0 / ₹0". */}
          {period === 'mtd' && (active.signings?.count ?? 0) === 0 ? (
            <div className="rounded-xl p-5 border border-dashed border-border-subtle bg-black/20 mb-6 flex flex-col items-center text-center gap-1.5">
              <Handshake className="w-6 h-6 text-brand-purple-400 mb-1" />
              <span className="text-sm font-bold text-white">No signings yet this month</span>
              <span className="text-[11px] text-text-secondary max-w-md">
                No MA has been signed so far this calendar month. See the
                <span className="text-brand-pink-400 font-semibold"> Upcoming Signings</span> table below for
                high-probability deals expected in the next ~20 days, or switch to
                <span className="text-brand-pink-400 font-semibold"> FY To-Date</span> for the fiscal-year total.
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="rounded-xl p-4 border border-border-subtle/60 bg-black/20 flex flex-col gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
                  <Handshake className="w-3 h-3 text-brand-pink-400" /> Signings
                </span>
                <span className="text-3xl font-black tabular-nums text-white">
                  {num(active.signings?.count ?? 0)}
                </span>
              </div>
              <div className="rounded-xl p-4 border border-border-subtle/60 bg-black/20 flex flex-col gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
                  <IndianRupee className="w-3 h-3 text-emerald-400" /> Collections (received)
                </span>
                <span className="text-3xl font-black tabular-nums text-emerald-400">
                  {inr(active.collections?.amount ?? 0)}
                </span>
              </div>
            </div>
          )}

          {/* Region-wise + brand-wise splits */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-secondary mb-3">
                Signings — by region
              </h3>
              <SplitBars data={active.signings?.byRegion || {}} colorFor={() => '#7c3aad'} />
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-secondary mt-5 mb-3">
                Signings — by brand
              </h3>
              <SplitBars data={active.signings?.byBrand || {}} colorFor={brandColor} />
            </div>
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-secondary mb-3">
                Collections — by region
              </h3>
              <SplitBars data={active.collections?.byRegion || {}} colorFor={() => '#34d399'} money />
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-secondary mt-5 mb-3">
                Collections — by brand
              </h3>
              <SplitBars data={active.collections?.byBrand || {}} colorFor={brandColor} money />
            </div>
          </div>

          <p className="mt-5 text-[11px] leading-relaxed text-text-secondary">
            {period === 'ytd' ? 'Financial year begins 1 Apr. ' : ''}
            <span className="text-amber-400/90 font-medium">Collections are approximate</span> — this is
            <span className="text-text-secondary font-medium"> Received (Actual_Amount_Total)</span>, attributed to
            each deal&apos;s signing (MA) date, as the CRM carries no per-payment date.
            {asOf ? <span className="text-text-secondary/70"> As of {asOf}.</span> : null}
          </p>
        </div>
      )}
    </div>
  );
}
