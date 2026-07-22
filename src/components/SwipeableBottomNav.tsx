'use client';

// ---------------------------------------------------------------------------
// SwipeableBottomNav (P-mobile v3). Replaces the old bottom tab bar + "More"
// sheet. A single-row, horizontally-scrollable chip carousel fixed to the
// bottom edge, rendered ONLY < md — the desktop side-rail (Sidebar) is unchanged
// and takes over at md+. Every core section is a first-class pill chip; nothing
// is hidden behind a "More" drawer any more:
//   Overview · Deals · BD Team · Signings & Revenue · Geography · Trends ·
//   Report Builder
// Momentum scroll (-webkit-overflow-scrolling) + scroll-snap, a hidden
// scrollbar, >=44px touch targets, and the active chip auto-centres on route
// change (it can start off-screen to the right). The active chip is brand-pink
// filled; the rest are muted neutral. Safe-area padding clears the home
// indicator, and AppShell reserves bottom room on the scroll container so page
// content never sits under the bar. There is deliberately NO "Ask AI" chip —
// Ask AI lives on the Overview hero (HeroAsk).
// ---------------------------------------------------------------------------

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import {
  LayoutDashboard, Handshake, Trophy, TrendingUp, Map, BarChart3, Table2,
} from 'lucide-react';
import clsx from 'clsx';

// The 7 core destinations, matched to the desktop Sidebar's URLs and icons so
// the two navs never diverge. Labels are the short forms the business uses.
const CHIPS = [
  { name: 'Overview', href: '/', icon: LayoutDashboard },
  { name: 'Deals', href: '/deals', icon: Handshake },
  { name: 'BD Team', href: '/team', icon: Trophy },
  { name: 'Signings & Revenue', href: '/portfolio', icon: TrendingUp },
  { name: 'Geography', href: '/geography', icon: Map },
  { name: 'Trends', href: '/analytics', icon: BarChart3 },
  { name: 'Report Builder', href: '/reports', icon: Table2 },
];

export function SwipeableBottomNav() {
  const pathname = usePathname();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLAnchorElement>(null);

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/');

  // Auto-centre the active chip whenever the route changes so the current
  // section is always in view. block:'nearest' keeps the PAGE from scrolling
  // vertically; the try/catch falls back to a manual scrollLeft on engines
  // without scrollIntoView options.
  useEffect(() => {
    const chip = activeRef.current;
    const scroller = scrollerRef.current;
    if (!chip || !scroller) return;
    try {
      chip.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    } catch {
      const left = chip.offsetLeft - (scroller.clientWidth - chip.clientWidth) / 2;
      scroller.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
    }
  }, [pathname]);

  return (
    <nav
      aria-label="Primary"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border-subtle bg-panel/95 backdrop-blur-2xl shadow-[0_-8px_30px_rgba(0,0,0,0.5)] pb-[env(safe-area-inset-bottom)]"
    >
      <div
        ref={scrollerRef}
        className="flex items-center gap-2 overflow-x-auto no-scrollbar snap-x snap-proximity scroll-px-3 px-3 py-2.5"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {CHIPS.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              ref={active ? activeRef : undefined}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={clsx(
                'snap-start shrink-0 inline-flex items-center gap-2 min-h-[44px] px-4 rounded-full border text-sm font-semibold whitespace-nowrap select-none transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-300',
                active
                  ? 'bg-brand-pink-500 border-brand-pink-500 text-white shadow-[0_0_16px_rgba(218,26,132,0.5)]'
                  : 'bg-surface/60 border-border-subtle text-text-secondary hover:text-white active:text-white'
              )}
            >
              <Icon
                className={clsx('w-[18px] h-[18px] shrink-0', active ? 'text-white' : 'text-brand-purple-300')}
                aria-hidden="true"
              />
              {item.name}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
