'use client';

import { useMemo, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { ChevronDown, Search } from 'lucide-react';

// Shared, accessible filter primitives used by BOTH the global FilterDrawer
// (grouped sections) and the /reports pivot page (its own independent filter state).
// Keeping them here means the two surfaces cannot drift apart in behaviour,
// keyboard handling or styling.

/** Option lists longer than this get a search box automatically. */
export const SEARCH_THRESHOLD = 10;

/* ------------------------------------------------------------------ */
/* Collapsible section                                                 */
/* ------------------------------------------------------------------ */

export function CollapsibleSection({
  id,
  title,
  count = 0,
  defaultOpen = false,
  children,
}: {
  id: string;
  title: string;
  /** Number of active selections inside — surfaced as a badge so a collapsed
   *  section never hides an applied filter. */
  count?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = `${id}-panel`;
  const btnId = `${id}-button`;

  return (
    <section className="rounded-xl border border-border-subtle bg-surface/40 overflow-hidden">
      <h3>
        <button
          id={btnId}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center justify-between gap-2 px-3.5 py-3 text-left cursor-pointer hover:bg-surface/70 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-400 focus-visible:ring-inset"
        >
          <span className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-semibold uppercase tracking-wider text-white truncate">{title}</span>
            {count > 0 && (
              <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-brand-pink-500/20 border border-brand-pink-500/50 text-[10px] font-bold text-brand-pink-300 tabular-nums">
                {count}
              </span>
            )}
          </span>
          <ChevronDown
            aria-hidden="true"
            className={clsx('w-4 h-4 shrink-0 text-text-secondary transition-transform duration-200', open && 'rotate-180')}
          />
        </button>
      </h3>
      {open && (
        <div id={panelId} role="region" aria-labelledby={btnId} className="px-3.5 pb-4 pt-1 flex flex-col gap-4">
          {children}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Searchable multi-select                                             */
/* ------------------------------------------------------------------ */

export function MultiSelectField({
  label,
  options,
  selected,
  onToggle,
  onClear,
  searchable,
  maxHeightClass = 'max-h-44',
  tone = 'purple',
  emptyHint,
}: {
  label: string;
  options: string[];
  selected: Set<string>;
  onToggle: (value: string) => void;
  onClear: () => void;
  /** Force the search box on/off. Defaults to "on when the list is long". */
  searchable?: boolean;
  maxHeightClass?: string;
  tone?: 'purple' | 'pink';
  emptyHint?: string;
}) {
  const [q, setQ] = useState('');
  const showSearch = searchable ?? options.length > SEARCH_THRESHOLD;

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((o) => o.toLowerCase().includes(needle));
  }, [options, q]);

  if (!options.length) {
    return emptyHint ? <p className="text-[11px] text-text-secondary italic">{emptyHint}</p> : null;
  }

  const inputId = `msf-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary truncate">{label}</span>
        <span className="flex items-center gap-2 shrink-0">
          {selected.size > 0 && (
            <>
              <span className="text-[10px] font-bold text-brand-pink-300 tabular-nums">{selected.size} selected</span>
              <button
                type="button"
                onClick={onClear}
                className="text-[10px] font-semibold text-text-secondary hover:text-white underline underline-offset-2 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-400 rounded px-1"
              >
                Clear
              </button>
            </>
          )}
        </span>
      </div>

      {showSearch && (
        <div className="relative">
          <Search aria-hidden="true" className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-secondary pointer-events-none" />
          <input
            id={inputId}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${label.toLowerCase()}…`}
            aria-label={`Search ${label}`}
            className="w-full bg-surface border border-border-subtle rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-white placeholder:text-text-secondary/70 focus:outline-none focus:border-brand-purple-400 focus-visible:ring-2 focus-visible:ring-brand-purple-400"
          />
        </div>
      )}

      <div className={clsx('flex flex-wrap gap-1.5 overflow-y-auto overflow-x-hidden', maxHeightClass)}>
        {visible.length === 0 && <span className="text-[11px] text-text-secondary italic">No match for “{q}”.</span>}
        {visible.map((val) => {
          const isActive = selected.has(val);
          return (
            <button
              key={val}
              type="button"
              onClick={() => onToggle(val)}
              aria-pressed={isActive}
              className={clsx(
                'max-w-full px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-200 border cursor-pointer truncate focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-panel',
                tone === 'pink' ? 'focus-visible:ring-brand-pink-400' : 'focus-visible:ring-brand-purple-400',
                isActive
                  ? tone === 'pink'
                    ? 'bg-brand-pink-500/20 border-brand-pink-500/60 text-white shadow-[0_0_10px_rgba(218,26,132,0.3)]'
                    : 'bg-brand-purple-600/50 border-brand-purple-400 text-white shadow-[0_0_10px_rgba(80,40,117,0.3)]'
                  : 'bg-surface border-border-subtle text-text-secondary hover:text-white hover:border-brand-purple-800'
              )}
            >
              {val}
            </button>
          );
        })}
      </div>
    </div>
  );
}
