'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import clsx from 'clsx';
import { X } from 'lucide-react';
import { useDialog } from '@/lib/useDialog';

// P2-4 — one reusable right-side drill-down drawer (styled like the Geography
// city dossier). Any aggregate can open it with (title, columns, rows) to list
// the underlying records. It carries NO export control: every download in the
// app now lives in the Report Builder page (/reports).
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

export function DrillProvider({ children }: { children: ReactNode }) {
  const [payload, setPayload] = useState<DrillPayload | null>(null);
  const openDrill = useCallback((p: DrillPayload) => setPayload(p), []);
  const close = () => setPayload(null);

  return (
    <DrillContext.Provider value={{ openDrill }}>
      {children}
      {payload && <DrillPanel payload={payload} onClose={close} />}
    </DrillContext.Provider>
  );
}

// P2-3 — the drawer is a real modal dialog: role="dialog" + aria-modal, a title
// wired via aria-labelledby, focus moved in on open and trapped, ESC to close,
// focus restored to the trigger on close, and a labelled close button. Split
// into its own component so the useDialog hook only runs while open.
function DrillPanel({
  payload,
  onClose,
}: {
  payload: DrillPayload;
  onClose: () => void;
}) {
  const dialogRef = useDialog<HTMLDivElement>(onClose);
  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drill-drawer-title"
        tabIndex={-1}
        className="fixed right-0 top-0 bottom-0 w-full max-w-[520px] glass-panel rounded-none border-y-0 border-r-0 border-l-brand-pink-500/20 z-[70] flex flex-col shadow-[0_0_80px_rgba(0,0,0,0.5)] animate-in slide-in-from-right duration-300 focus:outline-none"
      >
        <div className="flex items-center justify-between gap-3 p-5 border-b border-border-subtle bg-surface/30 shrink-0">
          <div className="min-w-0">
            <h2 id="drill-drawer-title" className="text-lg font-black text-white truncate">{payload.title}</h2>
            {payload.subtitle && (
              <p className="text-[11px] text-text-secondary mt-0.5">{payload.subtitle}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="p-2 rounded-lg hover:bg-surface text-text-secondary hover:text-white transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-400"
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
  );
}
