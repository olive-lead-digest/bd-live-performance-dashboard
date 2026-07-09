'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import clsx from 'clsx';
import { X, Download } from 'lucide-react';
import { toCsv as sharedToCsv } from '@/lib/csv';

// P2-4 — one reusable right-side drill-down drawer (styled like the Geography
// city dossier). Any aggregate can open it with (title, columns, rows, csv name)
// to list the underlying records + export that exact slice to CSV.
export interface DrillColumn {
  key: string;
  label: string;
  align?: 'left' | 'right';
  format?: (row: any) => string;
}

export interface DrillPayload {
  title: string;
  subtitle?: string;
  columns: DrillColumn[];
  rows: any[];
  csvFilename: string;
}

interface Ctx {
  openDrill: (p: DrillPayload) => void;
}

const DrillContext = createContext<Ctx | null>(null);

export function useDrill(): Ctx {
  const c = useContext(DrillContext);
  if (!c) throw new Error('useDrill must be used within DrillProvider');
  return c;
}

function cell(col: DrillColumn, row: any): string {
  if (col.format) return col.format(row);
  const v = row[col.key];
  return v == null ? '' : String(v);
}

// P2-3(1) — delegate to the single shared CSV implementation in lib/csv.ts.
function toCsv(p: DrillPayload): string {
  return sharedToCsv(p.columns, p.rows);
}

export function DrillProvider({ children }: { children: ReactNode }) {
  const [payload, setPayload] = useState<DrillPayload | null>(null);
  const openDrill = useCallback((p: DrillPayload) => setPayload(p), []);
  const close = () => setPayload(null);

  const download = () => {
    if (!payload) return;
    const blob = new Blob([toCsv(payload)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (payload.csvFilename || 'export') + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <DrillContext.Provider value={{ openDrill }}>
      {children}
      {payload && (
        <>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]" onClick={close} />
          <div className="fixed right-0 top-0 bottom-0 w-full max-w-[520px] glass-panel rounded-none border-y-0 border-r-0 border-l-brand-pink-500/20 z-[70] flex flex-col shadow-[0_0_80px_rgba(0,0,0,0.5)] animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between gap-3 p-5 border-b border-border-subtle bg-surface/30 shrink-0">
              <div className="min-w-0">
                <h2 className="text-lg font-black text-white truncate">{payload.title}</h2>
                {payload.subtitle && (
                  <p className="text-[11px] text-text-secondary mt-0.5">{payload.subtitle}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={download}
                  disabled={!payload.rows.length}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-pink-500/15 border border-brand-pink-500/40 text-brand-pink-300 text-[11px] font-bold uppercase tracking-wider hover:bg-brand-pink-500/25 transition-colors disabled:opacity-40"
                >
                  <Download className="w-3.5 h-3.5" /> CSV
                </button>
                <button
                  onClick={close}
                  className="p-2 rounded-lg hover:bg-surface text-text-secondary hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto no-scrollbar">
              {payload.rows.length === 0 ? (
                <div className="p-6 text-sm text-text-secondary">
                  No underlying records for this selection.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-panel/95 backdrop-blur">
                    <tr className="text-[10px] uppercase tracking-widest text-text-secondary border-b border-border-subtle">
                      {payload.columns.map((c) => (
                        <th
                          key={c.key}
                          className={clsx('py-2.5 px-4 font-bold', c.align === 'right' ? 'text-right' : 'text-left')}
                        >
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {payload.rows.map((r, i) => (
                      <tr key={i} className="border-b border-border-subtle/40 hover:bg-surface/30 transition-colors">
                        {payload.columns.map((c) => (
                          <td
                            key={c.key}
                            className={clsx(
                              'py-2.5 px-4',
                              c.align === 'right' ? 'text-right tabular-nums' : 'text-left',
                              c.key === 'name' ? 'text-white font-medium' : 'text-text-secondary'
                            )}
                          >
                            {cell(c, r)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </DrillContext.Provider>
  );
}
