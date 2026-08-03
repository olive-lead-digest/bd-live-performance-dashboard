'use client';

// ---------------------------------------------------------------------------
// MobileContextHeader (P-mobile v2). A compact single-row sticky header shown
// ONLY <md that gives the mobile viewer the three things the heavy desktop
// ContextBar carries, in ~52px: the active date range (or "All time"), a
// tappable summary of the active filters (opens the existing FilterDrawer), and
// a small data-freshness dot sourced from the feed `generated` stamp. The
// desktop ContextBar is hidden <md (see ContextBar / AppShell) so this never
// duplicates it. It pins to the top of the scroll column while the bottom
// MobileNav is fixed separately, so page content scrolls between the two.
// ---------------------------------------------------------------------------

import { useMemo, useState } from 'react';
import { Filter, Calendar, ChevronRight, LogOut } from 'lucide-react';
import clsx from 'clsx';
import { useDashboard } from '@/lib/DashboardContext';
import { shortDate } from '@/lib/format';
import type { ShellUser } from './AppShell';

const SET_KEYS = ['region', 'state', 'city', 'cluster', 'brand', 'status', 'prop', 'owner'] as const;

export function MobileContextHeader({ onOpenFilters, user = null }: { onOpenFilters: () => void; user?: ShellUser }) {
  const { filters, leadsAsOf } = useDashboard();
  const [loggingOut, setLoggingOut] = useState(false);

  const onLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      /* fall through to redirect regardless */
    }
    window.location.href = '/login';
  };

  const dateLabel = useMemo(() => {
    if (filters.presetLabel) return filters.presetLabel;
    if (filters.from && filters.to) return `${shortDate(filters.from)} - ${shortDate(filters.to)}`;
    if (filters.from) return `From ${shortDate(filters.from)}`;
    if (filters.to) return `Until ${shortDate(filters.to)}`;
    return 'All time';
  }, [filters.presetLabel, filters.from, filters.to]);

  const filterCount = useMemo(
    () => SET_KEYS.reduce((n, k) => n + (filters[k] as Set<string>).size, 0),
    [filters]
  );

  // Freshness — just the date portion of the feed `generated` timestamp.
  const asOf = leadsAsOf ? leadsAsOf.slice(0, 10) : null;

  return (
    <div className="md:hidden sticky top-0 z-30 h-[52px] flex items-stretch border-b border-border-subtle bg-panel/90 backdrop-blur-2xl">
      {/* Date range — taps into Filters, where the duration presets live. */}
      <button
        type="button"
        onClick={onOpenFilters}
        aria-label={`Date range: ${dateLabel}. Open filters`}
        className="flex items-center gap-1.5 pl-4 pr-3 min-w-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-pink-400 active:opacity-70"
      >
        <Calendar className="w-4 h-4 shrink-0 text-text-secondary" />
        <span className="text-xs font-semibold text-white truncate">{dateLabel}</span>
      </button>

      <div className="w-px my-2.5 bg-border-subtle shrink-0" />

      {/* Active filters — opens the existing FilterDrawer. */}
      <button
        type="button"
        onClick={onOpenFilters}
        aria-label={filterCount ? `${filterCount} active filters. Open filters` : 'Open filters'}
        className="flex items-center gap-1.5 px-3 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-pink-400 active:opacity-70"
      >
        <Filter className="w-4 h-4 shrink-0 text-text-secondary" />
        {filterCount > 0 ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-white">
            Filters
            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-brand-pink-500 text-white text-[11px] font-bold leading-none">
              {filterCount}
            </span>
          </span>
        ) : (
          <span className="text-xs font-semibold text-text-secondary">Filters</span>
        )}
        <ChevronRight className="w-3.5 h-3.5 -ml-0.5 text-text-secondary/70 shrink-0" />
      </button>

      {/* Freshness — pinned toward the right edge (or left of the user
          control below, when signed in). */}
      {asOf && (
        <div className={clsx('flex items-center gap-1.5 pl-2 shrink-0', !user && 'ml-auto pr-4')}>
          <span
            className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]"
            aria-hidden="true"
          />
          <span className="text-[11px] font-medium text-text-secondary whitespace-nowrap">as of {asOf}</span>
        </div>
      )}

      {/* Signed-in-as / log out — compact, since the desktop Sidebar's full
          control is hidden at this breakpoint. */}
      {user && (
        <button
          type="button"
          onClick={onLogout}
          disabled={loggingOut}
          aria-label={`Signed in as ${user.fullName}. Log out`}
          className="ml-auto flex items-center gap-1.5 pl-2 pr-4 shrink-0 disabled:opacity-50 active:opacity-70"
        >
          <span className="w-6 h-6 rounded-full bg-brand-pink-500/20 border border-brand-pink-500/40 flex items-center justify-center text-[10px] font-bold text-brand-pink-300 shrink-0">
            {user.fullName.trim().charAt(0).toUpperCase() || '?'}
          </span>
          <LogOut className="w-3.5 h-3.5 text-text-secondary" />
        </button>
      )}
    </div>
  );
}
