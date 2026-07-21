'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Handshake, Trophy, TrendingUp, Map, BarChart3, Table2, ChevronRight,
} from 'lucide-react';
import clsx from 'clsx';

// R-0 — 7 primary destinations, named in the words the business uses rather
// than in dashboard jargon: "Signings & Revenue" not "Portfolio & Fiscal",
// "Trends" not "Analytics", "Report Builder" not "Reports". The URLs are
// deliberately unchanged, so every existing link and bookmark still resolves.
// Report Builder is the ONLY entry point to the report tool — the duplicate
// control that used to sit in the header toolbar was removed.
// The standalone Directory section was removed (its /directory route now
// permanently redirects to Overview — see next.config redirects); the BD roster
// still ships inside the downloadable report.
const NAV_ITEMS = [
  { name: 'Overview', href: '/', icon: LayoutDashboard },
  { name: 'Deals & Pipeline', href: '/deals', icon: Handshake },
  { name: 'BD Team', href: '/team', icon: Trophy },
  { name: 'Signings & Revenue', href: '/portfolio', icon: TrendingUp },
  { name: 'Geography', href: '/geography', icon: Map },
  { name: 'Trends', href: '/analytics', icon: BarChart3 },
  { name: 'Report Builder', href: '/reports', icon: Table2 },
];

export function Sidebar({
  onOpenFilters,
  collapsed = false,
  onToggleCollapse,
}: {
  onOpenFilters: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const pathname = usePathname();
  const isActiveHref = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/');

  // Labels: on the expanded desktop rail (>=1280px, not collapsed) they are
  // always visible; on the compact/hover rail (mobile, or a collapsed desktop
  // rail) they reveal on hover.
  const labelCls = clsx(
    'whitespace-nowrap text-sm font-medium transition-opacity duration-300 opacity-0 group-hover:opacity-100',
    !collapsed && 'xl:opacity-100'
  );

  return (
    <aside
      className={clsx(
        'fixed left-0 top-0 bottom-0 z-40 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] bg-panel/90 backdrop-blur-2xl border-r border-border-subtle flex flex-col group overflow-hidden shadow-2xl',
        collapsed ? 'w-16 hover:w-64' : 'w-16 hover:w-64 xl:w-64'
      )}
    >
      {/* Brand lockup — the white "olive" wordmark (public/sitelogo-white.svg,
          native 94x32). The asset is a single white fill, so it sits directly on
          the dark rail with no plate behind it.

          Collapsed / narrow rail (64px): the wordmark cannot fit, so the window
          is clamped to 32px and clips to the spoke mark on the left of the
          artwork (the glyphs start at x=32.2 in the 94-unit viewBox, so the crop
          lands cleanly between the mark and the "l"). The image itself is always
          rendered at its native 94x32 — it is never squashed, so the aspect
          ratio is exact in both states and nothing overflows the rail. */}
      <div
        className={clsx(
          'flex h-16 shrink-0 items-center w-full relative justify-center group-hover:justify-start group-hover:px-6',
          !collapsed && 'xl:justify-start xl:px-6'
        )}
      >
        <span
          className={clsx(
            'relative block h-8 shrink-0 overflow-hidden transition-[width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
            'w-8 group-hover:w-[94px]',
            !collapsed && 'xl:w-[94px]'
          )}
        >
          <img
            src="/sitelogo-white.svg"
            alt="Olive Hospitality"
            width={94}
            height={32}
            className="block h-8 w-[94px] max-w-none select-none"
            draggable={false}
          />
        </span>
        {/* The wordmark already carries "olive", so the old duplicate
            "Olive Hospitality" text label is gone; only the qualifier remains.

            It is `hidden` on the narrow rail, not merely opacity-0: a laid-out
            `whitespace-nowrap` label is a flex item with min-width:auto, so it
            made this header's content wider than the 64px rail, and
            `justify-center` then centred the OVERFLOW - which pushed the
            wordmark to x=-30px, clean off the rail. Out of flow, the mark
            centres at x=16 like every nav icon. */}
        <span
          className={clsx(
            'hidden group-hover:inline ml-2.5 text-text-secondary font-semibold uppercase text-[10px] tracking-[0.2em]',
            !collapsed && 'xl:inline',
            labelCls
          )}
        >
          Hospitality
        </span>
      </div>

      <nav className="flex-1 mt-6 flex flex-col gap-2 px-2">
        {NAV_ITEMS.map((item) => {
          const isActive = isActiveHref(item.href);
          return (
            <Link
              key={item.name}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={clsx(
                'flex items-center w-full h-11 rounded-xl relative group/item transition-colors border',
                isActive
                  ? 'bg-brand-pink-500/15 border-brand-pink-500/40'
                  : 'border-transparent hover:bg-surface/50'
              )}
            >
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-brand-pink-500 rounded-r-full shadow-[0_0_10px_rgba(218,26,132,0.7)]" />
              )}
              <div className="w-12 h-full flex items-center justify-center shrink-0">
                <item.icon
                  className={clsx(
                    'w-5 h-5 transition-colors',
                    isActive ? 'text-brand-pink-400' : 'text-text-secondary group-hover/item:text-brand-purple-300'
                  )}
                />
              </div>
              <span className={clsx(labelCls, isActive ? 'text-white' : 'text-text-secondary group-hover/item:text-white')}>
                {item.name}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto mb-4 px-2 flex flex-col gap-2">
        {/* P2-6 — the mobile "Filters" entry point lives in the ContextBar
            toolbar; the sidebar no longer renders a second one, so only ONE
            Filters button is present at mobile widths. */}

        {/* Collapse / expand control — only meaningful on the >=1280px rail. */}
        <button
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          className="hidden xl:flex items-center w-full h-11 rounded-xl relative group/item hover:bg-surface/50 transition-colors border border-transparent"
        >
          <div className="w-12 h-full flex items-center justify-center shrink-0">
            <ChevronRight
              className={clsx(
                'w-5 h-5 text-text-secondary group-hover/item:text-white transition-transform duration-300',
                !collapsed && 'rotate-180'
              )}
            />
          </div>
          <span className={clsx(labelCls, 'text-text-secondary group-hover/item:text-white')}>
            {collapsed ? 'Expand' : 'Collapse'}
          </span>
        </button>
      </div>
    </aside>
  );
}
