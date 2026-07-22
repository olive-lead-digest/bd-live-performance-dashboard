'use client';

// ---------------------------------------------------------------------------
// SummaryKPIBlock (P-mobile v2). Executive top-of-page KPIs with F-pattern
// emphasis: a huge primary value scanned first, a readable (>=12px) label, and
// an optional delta vs the prior period whose ARROW shows direction and whose
// COLOUR carries the ONLY strong red/green on the tile — emerald = a good move,
// rose = a bad move, inverted for `lowerIsBetter` metrics (e.g. drop rate). The
// containers stay deliberately muted (bg-black/20 + border-border-subtle) so the
// numbers lead, not a rainbow of tile colours. Rendered <md only; the desktop
// KPI rail is left completely untouched.
// ---------------------------------------------------------------------------

import clsx from 'clsx';
import { ArrowUp, ArrowDown } from 'lucide-react';

export interface SummaryKPI {
  label: string;
  value: string;
  prefix?: string;
  suffix?: string;
  /** Small caption under the value, e.g. "MA + Spark LOI". */
  sub?: string;
  /** Signed change vs the prior period. null/undefined => no delta shown. */
  delta?: number | null;
  /** Text shown next to the arrow, e.g. "4.2%" or "1.3pp". Defaults to the
   *  numeric delta as a percentage. */
  deltaLabel?: string;
  /** When true a DECREASE is the good direction (e.g. drop rate) so the
   *  semantic colour inverts. */
  lowerIsBetter?: boolean;
}

function Delta({ delta, deltaLabel, lowerIsBetter }: Pick<SummaryKPI, 'delta' | 'deltaLabel' | 'lowerIsBetter'>) {
  if (delta == null || !Number.isFinite(delta)) return null;
  const flat = Math.abs(delta) < 0.05;
  const good = lowerIsBetter ? delta < 0 : delta > 0;
  const up = delta > 0;
  const tone = flat ? 'text-text-secondary' : good ? 'text-emerald-400' : 'text-rose-400';
  const Arrow = up ? ArrowUp : ArrowDown;
  const label = deltaLabel ?? `${Math.abs(delta).toFixed(1)}%`;
  return (
    <span
      className={clsx('inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums shrink-0', tone)}
      title="vs the same window last month"
    >
      {!flat && <Arrow className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
      {label}
    </span>
  );
}

export function SummaryKPIBlock({ items, className }: { items: SummaryKPI[]; className?: string }) {
  return (
    <section aria-label="Key metrics" className={clsx('grid grid-cols-2 gap-3', className)}>
      {items.map((k) => (
        <div
          key={k.label}
          className="relative rounded-2xl border border-border-subtle bg-black/20 p-4 flex flex-col justify-between min-h-[108px]"
        >
          <div className="flex items-baseline gap-1 flex-nowrap whitespace-nowrap min-w-0">
            {k.prefix && <span className="text-lg font-bold text-text-secondary">{k.prefix}</span>}
            <span className="text-3xl font-extrabold tracking-tight text-white tabular-nums leading-none">{k.value}</span>
            {k.suffix && <span className="text-lg font-bold text-text-secondary">{k.suffix}</span>}
          </div>
          <div className="mt-3">
            <div className="text-xs font-medium text-text-secondary leading-tight">{k.label}</div>
            <div className="mt-1 flex items-center justify-between gap-2 min-h-[18px]">
              {k.sub ? <span className="text-xs text-text-secondary/80 truncate">{k.sub}</span> : <span aria-hidden="true" />}
              <Delta delta={k.delta} deltaLabel={k.deltaLabel} lowerIsBetter={k.lowerIsBetter} />
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}
