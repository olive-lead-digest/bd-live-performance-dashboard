'use client';

import { X } from 'lucide-react';
import { useDashboard } from '@/lib/DashboardContext';
import clsx from 'clsx';
import { useMemo } from 'react';
import { useDialog } from '@/lib/useDialog';
import { CollapsibleSection, MultiSelectField } from './FilterControls';
import { buildDatePresets, latestLeadDate, activePreset } from '@/lib/datePresets';

// Tier removed (analyst correction — the feed no longer carries a lead tier).
//
// The drawer used to render Duration + 8 dimensions as ONE long flat scroll.
// It is now grouped into collapsible sections (Time / Business / People /
// Geography) with an active-filter chip summary on top and a sticky footer.
// Behaviour is deliberately unchanged: same option derivation, same
// setFilter/setDateRange calls (so URL serialisation still works), and the same
// preset IDENTITY highlighting.

type DimKey = 'brand' | 'region' | 'status' | 'cluster' | 'state' | 'city' | 'prop' | 'owner';

const DIM_LABEL: Record<DimKey, string> = {
  brand: 'Brand',
  region: 'Region',
  status: 'Status',
  cluster: 'Cluster',
  state: 'State',
  city: 'City',
  prop: 'Property Status',
  owner: 'BD Rep',
};

const ALL_DIMS: DimKey[] = ['brand', 'region', 'status', 'cluster', 'state', 'city', 'prop', 'owner'];

const SECTIONS: { id: string; title: string; dims: DimKey[] }[] = [
  { id: 'filter-business', title: 'Business', dims: ['brand', 'status', 'prop'] },
  { id: 'filter-people', title: 'People', dims: ['owner'] },
  { id: 'filter-geography', title: 'Geography', dims: ['region', 'state', 'city', 'cluster'] },
];

export function FilterDrawer({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { data, filters, setFilter, clearFilters, setDateRange } = useDashboard();
  // P2-3 — the filter drawer is a real modal dialog: role="dialog" + aria-modal,
  // labelled by its title, focus moved in + trapped, ESC to close, focus restored
  // to the trigger on close. The hook is called unconditionally and only
  // activates while the drawer is open.
  const dialogRef = useDialog<HTMLDivElement>(onClose, isOpen);

  // Extract unique values from data for dropdowns
  const options = useMemo(() => {
    if (!data) return {} as Record<string, string[]>;
    const res: Record<string, Set<string>> = {};
    ALL_DIMS.forEach((k) => (res[k] = new Set()));

    data.leads.forEach((l) => {
      if (l.brand) res.brand.add(l.brand);
      if (l.region) res.region.add(l.region);
      if (l.status) res.status.add(l.status);
      else res.status.add('(unassigned)');
      if (l.cluster) res.cluster.add(l.cluster);
      if (l.state) res.state.add(l.state);
      if (l.city) res.city.add(l.city);
      if (l.prop) res.prop.add(l.prop);
      if (l.owner) res.owner.add(l.owner);
    });

    const final: Record<string, string[]> = {};
    Object.keys(res).forEach((k) => {
      final[k] = Array.from(res[k]).filter(Boolean).sort();
    });
    return final;
  }, [data]);

  // Quick duration presets, computed relative to the latest date present in the
  // data (shared with the ReportBuilder via lib/datePresets).
  const presets = useMemo(() => buildDatePresets(latestLeadDate(data?.leads)), [data]);

  // Highlight the chip the user actually CHOSE (identity, not range equality) —
  // see activePreset(): two presets sharing a range must never both light up.
  const activePresetLabel = activePreset(presets, filters.presetLabel, filters.from, filters.to);

  // Region heads → their BDs, for the People section quick-select. Only heads
  // whose BDs actually appear in the lead data are offered.
  const regionHeads = useMemo(() => {
    const regions = data?.org?.regions;
    if (!regions) return [] as { head: string; region: string; bds: string[] }[];
    const known = new Set(options.owner || []);
    return Object.entries(regions)
      .map(([region, v]) => ({
        region,
        head: v?.head || '',
        bds: (v?.bds || []).filter((b) => known.has(b)),
      }))
      .filter((r) => r.head && r.bds.length)
      .sort((a, b) => a.head.localeCompare(b.head));
  }, [data, options.owner]);

  const count = (k: DimKey) => (filters[k] as Set<string>).size;
  const sectionCount = (dims: DimKey[]) => dims.reduce((a, d) => a + count(d), 0);
  const timeCount = filters.from || filters.to ? 1 : 0;

  const clearDim = (k: DimKey) => setFilter(k, '', true);
  const clearSection = (dims: DimKey[]) => dims.forEach((d) => clearDim(d));

  // Active-filter chips — everything currently applied, each removable.
  const chips: { id: string; label: string; onRemove: () => void }[] = [];
  if (filters.from || filters.to) {
    chips.push({
      id: 'date',
      label: `${filters.from || '…'} → ${filters.to || '…'}`,
      onRemove: () => setDateRange('', ''),
    });
  }
  ALL_DIMS.forEach((k) => {
    (filters[k] as Set<string>).forEach((v) => {
      chips.push({ id: `${k}::${v}`, label: `${DIM_LABEL[k]}: ${v}`, onRemove: () => setFilter(k, v) });
    });
  });

  const toggleHead = (bds: string[]) => {
    const allOn = bds.every((b) => filters.owner.has(b));
    bds.forEach((b) => {
      const on = filters.owner.has(b);
      if (allOn === on) setFilter('owner', b); // remove when all on, add when missing
    });
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="filter-drawer-title"
        tabIndex={-1}
        className="fixed right-0 top-0 bottom-0 w-full max-w-sm bg-panel border-l border-border-subtle shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300 focus:outline-none"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-4 border-b border-border-subtle shrink-0">
          <h2 id="filter-drawer-title" className="text-lg font-semibold text-white">
            Filters
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-2 rounded-lg hover:bg-surface text-text-secondary hover:text-white transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-400"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Active-filter summary — nothing applied is ever hidden in a collapsed section. */}
        {chips.length > 0 && (
          <div className="px-4 sm:px-5 py-3 border-b border-border-subtle bg-surface/30 shrink-0">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
                Active · {chips.length}
              </span>
              <button
                type="button"
                onClick={clearFilters}
                className="text-[10px] font-semibold text-brand-pink-400 hover:text-brand-pink-300 underline underline-offset-2 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-400 rounded px-1"
              >
                Clear all
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
              {chips.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={c.onRemove}
                  aria-label={`Remove filter ${c.label}`}
                  className="group inline-flex items-center gap-1.5 max-w-full px-2.5 py-1 rounded-full bg-brand-purple-900/50 border border-brand-purple-500/40 text-[11px] text-white hover:bg-brand-purple-800/70 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-400 focus-visible:ring-offset-1 focus-visible:ring-offset-panel"
                >
                  <span className="truncate">{c.label}</span>
                  <X aria-hidden="true" className="w-3 h-3 shrink-0 text-text-secondary group-hover:text-brand-pink-400" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Sections */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 sm:px-5 py-4 flex flex-col gap-3">
          {/* Time — expanded by default */}
          <CollapsibleSection id="filter-time" title="Time" count={timeCount} defaultOpen>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">Duration</span>
                {timeCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setDateRange('', '')}
                    className="text-[10px] font-semibold text-text-secondary hover:text-white underline underline-offset-2 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-400 rounded px-1"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {presets.map((p) => {
                  const isActive = p.label === activePresetLabel;
                  return (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => setDateRange(p.from, p.to, p.label)}
                      aria-pressed={isActive}
                      className={clsx(
                        'px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-200 border cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-400 focus-visible:ring-offset-1 focus-visible:ring-offset-panel',
                        isActive
                          ? 'bg-brand-pink-500/20 border-brand-pink-500/60 text-white shadow-[0_0_10px_rgba(218,26,132,0.3)]'
                          : 'bg-surface border-border-subtle text-text-secondary hover:text-white hover:border-brand-pink-500/40'
                      )}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2 mt-1">
                <input
                  type="date"
                  value={filters.from}
                  aria-label="From date"
                  onChange={(e) => setDateRange(e.target.value, filters.to)}
                  className="flex-1 min-w-0 bg-surface border border-border-subtle rounded-lg px-2.5 py-2 text-sm text-white focus:outline-none focus:border-brand-purple-400"
                />
                <input
                  type="date"
                  value={filters.to}
                  aria-label="To date"
                  onChange={(e) => setDateRange(filters.from, e.target.value)}
                  className="flex-1 min-w-0 bg-surface border border-border-subtle rounded-lg px-2.5 py-2 text-sm text-white focus:outline-none focus:border-brand-purple-400"
                />
              </div>
            </div>
          </CollapsibleSection>

          {SECTIONS.map((sec) => {
            const dims = sec.dims.filter((d) => (options[d] || []).length > 0);
            const isPeople = sec.id === 'filter-people';
            if (!dims.length && !(isPeople && regionHeads.length)) return null;
            const n = sectionCount(sec.dims);
            return (
              <CollapsibleSection key={sec.id} id={sec.id} title={sec.title} count={n}>
                {n > 0 && (
                  <div className="flex justify-end -mb-1">
                    <button
                      type="button"
                      onClick={() => clearSection(sec.dims)}
                      className="text-[10px] font-semibold text-text-secondary hover:text-white underline underline-offset-2 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-400 rounded px-1"
                    >
                      Clear {sec.title.toLowerCase()}
                    </button>
                  </div>
                )}

                {isPeople && regionHeads.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
                      Region head <span className="normal-case font-normal tracking-normal">— selects their BDs</span>
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {regionHeads.map((h) => {
                        const on = h.bds.every((b) => filters.owner.has(b));
                        return (
                          <button
                            key={`${h.region}:${h.head}`}
                            type="button"
                            onClick={() => toggleHead(h.bds)}
                            aria-pressed={on}
                            title={`${h.head} · ${h.region} · ${h.bds.length} BD${h.bds.length === 1 ? '' : 's'}`}
                            className={clsx(
                              'max-w-full px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all border cursor-pointer truncate focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-400 focus-visible:ring-offset-1 focus-visible:ring-offset-panel',
                              on
                                ? 'bg-brand-pink-500/20 border-brand-pink-500/60 text-white'
                                : 'bg-surface border-border-subtle text-text-secondary hover:text-white hover:border-brand-pink-500/40'
                            )}
                          >
                            {h.head} <span className="opacity-60">({h.bds.length})</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {dims.map((d) => (
                  <MultiSelectField
                    key={d}
                    label={DIM_LABEL[d]}
                    options={options[d] || []}
                    selected={filters[d] as Set<string>}
                    onToggle={(v) => setFilter(d, v)}
                    onClear={() => clearDim(d)}
                  />
                ))}
              </CollapsibleSection>
            );
          })}
        </div>

        {/* Sticky footer — always visible */}
        <div className="shrink-0 px-4 sm:px-5 py-4 border-t border-border-subtle bg-panel flex gap-3">
          <button
            type="button"
            onClick={clearFilters}
            className="flex-1 py-2.5 rounded-xl border border-border-subtle text-sm font-semibold text-white hover:bg-surface transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-400 focus-visible:ring-offset-1 focus-visible:ring-offset-panel"
          >
            Clear All
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-brand-pink-500 text-sm font-bold text-white hover:bg-brand-pink-400 transition-colors shadow-[0_0_15px_rgba(218,26,132,0.4)] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-300 focus-visible:ring-offset-1 focus-visible:ring-offset-panel"
          >
            Apply Filters
          </button>
        </div>
      </div>
    </>
  );
}
