'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Filter, X, Building2, Table2 } from 'lucide-react';
import { useDashboard } from '@/lib/DashboardContext';
import clsx from 'clsx';
import { DownloadReport } from './DownloadReport';
import { LeadsAsOfStamp } from './DataBadges';

const BRANDS = ['All', 'Olive', 'Spark', 'Open Hotels'];

export function ContextBar({ onOpenFilters }: { onOpenFilters: () => void }) {
  const { filters, setFilter, clearFilters, setDateRange } = useDashboard();
  const pathname = usePathname();
  const onReports = pathname === '/reports';

  const activeChips: { key: string; label: string; id: string }[] = [];
  
  if (filters.from || filters.to) {
    activeChips.push({ key: 'date', label: `Date: ${filters.from || '…'} → ${filters.to || '…'}`, id: 'date' });
  }

  ['region', 'cluster', 'state', 'city', 'status', 'prop', 'owner'].forEach(k => {
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
    <div className="sticky top-0 z-30 w-full glass-card border-x-0 border-t-0 rounded-none h-14 flex items-center px-2 sm:px-6 gap-2 sm:gap-4 overflow-x-auto no-scrollbar">
      <button
        type="button"
        onClick={onOpenFilters}
        className="flex items-center gap-2 px-3 py-2 min-h-[38px] rounded-lg bg-surface hover:bg-brand-purple-800/50 border border-border-subtle transition-colors group shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-400 focus-visible:ring-offset-1 focus-visible:ring-offset-panel active:scale-95"
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
            type="button"
            onClick={() => handleBrandSelect(b)}
            aria-pressed={currentBrand === b}
            className={clsx(
              // P2-1 — real button hit target: ≥34px tall, 11px text, pointer
              // cursor, visible hover / active / focus-visible states.
              "px-2.5 sm:px-3 py-1.5 min-h-[34px] rounded-md text-[11px] font-bold uppercase tracking-widest transition-all cursor-pointer select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple-400 focus-visible:ring-offset-1 focus-visible:ring-offset-black active:scale-95",
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
          <span className="hidden sm:inline text-sm text-text-secondary font-medium">All data · No filters applied</span>
        ) : (
          <>
            <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider shrink-0 mr-2">Active:</span>
            {activeChips.map(chip => (
              <button
                key={chip.id}
                type="button"
                aria-label={`Remove filter ${chip.label}`}
                onClick={() => {
                  if (chip.key === 'date') setDateRange('', '');
                  else setFilter(chip.key as any, chip.id.split('::')[1]);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand-purple-900/40 border border-brand-purple-500/30 text-xs text-white hover:bg-brand-purple-800/60 transition-colors whitespace-nowrap shrink-0 group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-400 focus-visible:ring-offset-1 focus-visible:ring-offset-panel active:scale-95"
              >
                {chip.label}
                <X className="w-3 h-3 text-text-secondary group-hover:text-brand-pink-400" />
              </button>
            ))}
            {(activeChips.length > 0 || currentBrand !== 'All') && (
              <button
                type="button"
                onClick={clearFilters}
                className="text-xs text-brand-pink-400 font-semibold hover:text-brand-pink-300 ml-2 whitespace-nowrap shrink-0 cursor-pointer px-2 py-1.5 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-400 focus-visible:ring-offset-1 focus-visible:ring-offset-panel active:scale-95"
              >
                Clear all
              </button>
            )}
          </>
        )}
      </div>

      <LeadsAsOfStamp className="hidden lg:block shrink-0 not-italic whitespace-nowrap" />
      <div className="w-[1px] h-6 bg-border-subtle shrink-0" />
      {/* Report builder — NAVIGATES to the /reports pivot page. It used to open a
          modal; there is now exactly one report tool, and it is a real page. */}
      <Link
        href="/reports"
        aria-current={onReports ? 'page' : undefined}
        title="Open the report builder"
        className={clsx(
          'flex items-center gap-2 px-2.5 py-1.5 min-h-[38px] rounded-lg border transition-colors group shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-400 focus-visible:ring-offset-1 focus-visible:ring-offset-panel active:scale-95',
          onReports
            ? 'bg-brand-pink-500/30 border-brand-pink-500/70'
            : 'bg-brand-pink-500/15 hover:bg-brand-pink-500/25 border-brand-pink-500/40'
        )}
      >
        <Table2 className="w-4 h-4 text-brand-pink-400" aria-hidden="true" />
        <span className="text-xs font-semibold text-brand-pink-400 group-hover:text-brand-pink-300 whitespace-nowrap hidden sm:inline">
          Create report
        </span>
      </Link>
      <DownloadReport compact />
    </div>
  );
}
