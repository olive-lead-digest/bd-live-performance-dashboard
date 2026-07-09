'use client';

import { Download } from 'lucide-react';
import { csvFilename, downloadCsv, type CsvColumn } from '@/lib/csv';
import type { Filters } from '@/lib/DashboardContext';

// P2-3(1) — small reusable "CSV" button. Hand it the CURRENT (filtered) rows a
// table is rendering; it exports exactly those to a filter-aware filename.
export function CsvButton({
  base,
  filters,
  columns,
  rows,
  label = 'CSV',
  className,
  title,
}: {
  base: string;
  filters?: Filters | null;
  columns: CsvColumn[];
  rows: any[];
  label?: string;
  className?: string;
  title?: string;
}) {
  const count = Array.isArray(rows) ? rows.length : 0;
  const disabled = count === 0;
  return (
    <button
      type="button"
      onClick={() => { if (!disabled) downloadCsv(csvFilename(base, filters), columns, rows); }}
      disabled={disabled}
      title={title || `Export ${count} row${count === 1 ? '' : 's'} to CSV`}
      className={
        className ||
        'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-brand-pink-500/15 border border-brand-pink-500/40 text-brand-pink-300 text-[10px] font-bold uppercase tracking-wider hover:bg-brand-pink-500/25 transition-colors disabled:opacity-40 shrink-0'
      }
    >
      <Download className="w-3.5 h-3.5" /> {label}
    </button>
  );
}
