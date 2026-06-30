'use client';

import { Filter, X, Building2 } from 'lucide-react';
import { useDashboard } from '@/lib/DashboardContext';
import clsx from 'clsx';

const BRANDS = ['All', 'Olive', 'Spark', 'Open Hotels'];

export function ContextBar({ onOpenFilters }: { onOpenFilters: () => void }) {
  const { filters, setFilter, clearFilters, setDateRange } = useDashboard();

  const activeChips: { key: string; label: string; id: string }[] = [];
  
  if (filters.from || filters.to) {
    activeChips.push({ key: 'date', label: `Date: ${filters.from || '…'} → ${filters.to || '…'}`, id: 'date' });
  }

  ['region', 'cluster', 'state', 'city', 'tier', 'status', 'prop', 'owner'].forEach(k => {
    const set = filters[k as keyof typeof filters] as Set<string>;
    set.forEach(v => {
      activeChips.push({ key: k, label: `${k}: ${v}`, id: `${k}::${v}` });
    });
  });

  const currentBrand = filters.brand.size === 1 ? Array.from(filters.brand)[0] : 'All';

  const handleBrandSelect = (b: string) => {
    if (b === 'All') {
      setFilter('brand', '', true); // clear
    } else {
      setFilter('brand', '', true);
      setFilter('brand', b);
    }
  };

  return (
    <div className="sticky top-0 z-30 w-full glass-card border-x-0 border-t-0 rounded-none h-14 flex items-center px-3 sm:px-6 gap-3 sm:gap-4 overflow-x-auto no-scrollbar">
      <button
        onClick={onOpenFilters}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface hover:bg-brand-purple-800/50 border border-border-subtle transition-colors group shrink-0"
      >
        <Filter className="w-4 h-4 text-text-secondary group-hover:text-brand-pink-400 transition-colors" />
        <span className="text-xs font-semibold text-text-secondary group-hover:text-white">Filters</span>
      </button>

      <div className="w-[1px] h-6 bg-border-subtle shrink-0" />

      {/* Global Brand Selector */}
      <div className="flex bg-black/40 p-1 rounded-lg border border-border-subtle/50 backdrop-blur-md shrink-0 items-center">
        <Building2 className="w-3 h-3 text-text-secondary mx-2" />
        {BRANDS.map(b => (
          <button
            key={b}
            onClick={() => handleBrandSelect(b)}
            className={clsx(
              "px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all",
              currentBrand === b 
                ? "bg-brand-purple-500/20 text-brand-purple-400 shadow-[0_0_10px_rgba(80,40,117,0.3)]" 
                : "text-text-secondary hover:text-white hover:bg-white/5"
            )}
          >
            {b}
          </button>
        ))}
      </div>

      <div className="w-[1px] h-6 bg-border-subtle shrink-0" />

      <div className="flex-1 min-w-[120px] flex items-center gap-2 scroll-smooth">
        {activeChips.length === 0 && currentBrand === 'All' ? (
          <span className="text-sm text-text-secondary font-medium">All data · No filters applied</span>
        ) : (
          <>
            <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider shrink-0 mr-2">Active:</span>
            {activeChips.map(chip => (
              <button
                key={chip.id}
                onClick={() => {
                  if (chip.key === 'date') setDateRange('', '');
                  else setFilter(chip.key as any, chip.id.split('::')[1]);
                }}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-purple-900/40 border border-brand-purple-500/30 text-xs text-white hover:bg-brand-purple-800/60 transition-colors whitespace-nowrap shrink-0 group"
              >
                {chip.label}
                <X className="w-3 h-3 text-text-secondary group-hover:text-brand-pink-400" />
              </button>
            ))}
            {(activeChips.length > 0 || currentBrand !== 'All') && (
              <button
                onClick={clearFilters}
                className="text-xs text-brand-pink-400 font-semibold hover:text-brand-pink-300 ml-2 whitespace-nowrap shrink-0"
              >
                Clear all
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
