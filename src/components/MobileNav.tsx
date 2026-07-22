'use client';

// ---------------------------------------------------------------------------
// Mobile bottom navigation (P-mobile M1, extended in v2). Rendered ONLY below
// `md` (the desktop side-rail is hidden < md and returns unchanged at md+).
// Five primary destinations as >=44px touch targets with icon + label + active
// state (brand-pink): Overview, Deals, BD Team, Ask AI, and a "More" item that
// opens a slide-up sheet listing the remaining routes and the Filters entry.
// "Ask AI" is a key CTA (brand-pink icon) that routes to the Overview Ask-AI
// hero and focuses it (/?ask=1 on cross-page, an olive:ask-focus event when
// already on Overview). Sticks to the bottom with safe-area-inset padding; page
// content reserves room via bottom padding on the scroll container (AppShell).
// ---------------------------------------------------------------------------

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import {
  LayoutDashboard, Handshake, Trophy, Sparkles,
  MoreHorizontal, TrendingUp, Map, BarChart3, Table2, Filter, X,
} from 'lucide-react';
import clsx from 'clsx';
import { useDialog } from '@/lib/useDialog';

const PRIMARY = [
  { name: 'Overview', href: '/', icon: LayoutDashboard },
  { name: 'Deals', href: '/deals', icon: Handshake },
  { name: 'BD Team', href: '/team', icon: Trophy },
];

const MORE = [
  { name: 'Signings & Revenue', href: '/portfolio', icon: TrendingUp },
  { name: 'Geography', href: '/geography', icon: Map },
  { name: 'Trends', href: '/analytics', icon: BarChart3 },
  { name: 'Report Builder', href: '/reports', icon: Table2 },
];

export function MobileNav({ onOpenFilters }: { onOpenFilters: () => void }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const sheetRef = useDialog<HTMLDivElement>(() => setMoreOpen(false), moreOpen);

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/');
  const moreActive = MORE.some((m) => isActive(m.href));

  // Close the sheet whenever the route changes (a link inside it was tapped).
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  // Ask AI: route to the Overview Ask-AI hero and focus it. When already on
  // Overview the input is mounted, so a same-tab event focuses it instantly;
  // otherwise /?ask=1 is read by HeroAsk on mount after the route change.
  const askAi = () => {
    try {
      window.dispatchEvent(new Event('olive:ask-focus'));
    } catch {
      /* ignore — the ?ask=1 param still drives focus on the Overview mount */
    }
  };

  return (
    <>
      <nav
        aria-label="Primary"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border-subtle bg-panel/95 backdrop-blur-2xl shadow-[0_-8px_30px_rgba(0,0,0,0.5)] pb-[env(safe-area-inset-bottom)]"
      >
        <div className="grid grid-cols-5">
          {PRIMARY.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={clsx(
                  'relative flex flex-col items-center justify-center gap-1 min-h-[56px] py-2 select-none transition-colors',
                  active ? 'text-brand-pink-400' : 'text-text-secondary hover:text-white active:text-white'
                )}
              >
                {active && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-full bg-brand-pink-500 shadow-[0_0_10px_rgba(218,26,132,0.7)]" />
                )}
                <Icon className="w-[22px] h-[22px] shrink-0" />
                <span className="text-xs font-semibold leading-none">{item.name}</span>
              </Link>
            );
          })}

          {/* Ask AI — key CTA. Navigates to the Overview hero and focuses it. */}
          <Link
            href="/?ask=1"
            onClick={askAi}
            aria-label="Ask AI"
            className="relative flex flex-col items-center justify-center gap-1 min-h-[56px] py-2 select-none transition-colors text-brand-pink-400 active:text-brand-pink-300"
          >
            <Sparkles className="w-[22px] h-[22px] shrink-0" />
            <span className="text-xs font-semibold leading-none text-white">Ask AI</span>
          </Link>

          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            className={clsx(
              'relative flex flex-col items-center justify-center gap-1 min-h-[56px] py-2 select-none transition-colors focus:outline-none',
              moreActive || moreOpen ? 'text-brand-pink-400' : 'text-text-secondary hover:text-white active:text-white'
            )}
          >
            {moreActive && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-full bg-brand-pink-500 shadow-[0_0_10px_rgba(218,26,132,0.7)]" />
            )}
            <MoreHorizontal className="w-[22px] h-[22px] shrink-0" />
            <span className="text-xs font-semibold leading-none">More</span>
          </button>
        </div>
      </nav>

      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setMoreOpen(false)} aria-hidden="true" />
          <div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="More navigation"
            tabIndex={-1}
            className="absolute inset-x-0 bottom-0 glass-panel rounded-t-2xl rounded-b-none border-b-0 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-[0_-20px_60px_rgba(0,0,0,0.6)] animate-sheet-up focus:outline-none"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-widest text-white">More</span>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                aria-label="Close"
                className="w-11 h-11 -mr-2 flex items-center justify-center rounded-lg text-text-secondary hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col gap-1">
              {MORE.map((item) => {
                const active = isActive(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    aria-current={active ? 'page' : undefined}
                    className={clsx(
                      'flex items-center gap-3 min-h-[52px] px-3 rounded-xl border transition-colors',
                      active
                        ? 'bg-brand-pink-500/15 border-brand-pink-500/40 text-white'
                        : 'border-transparent text-text-secondary hover:bg-surface/50 hover:text-white'
                    )}
                  >
                    <Icon className={clsx('w-5 h-5 shrink-0', active ? 'text-brand-pink-400' : '')} />
                    <span className="text-sm font-semibold">{item.name}</span>
                  </Link>
                );
              })}

              <div className="my-1 h-px bg-border-subtle" />

              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  onOpenFilters();
                }}
                className="flex items-center gap-3 min-h-[52px] px-3 rounded-xl border border-transparent text-text-secondary hover:bg-surface/50 hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-400"
              >
                <Filter className="w-5 h-5 shrink-0" />
                <span className="text-sm font-semibold">Filters</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
