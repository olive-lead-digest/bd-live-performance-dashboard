'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Trophy, GitMerge, Map, Users, Settings, Filter, SplitSquareHorizontal, BarChart3, Handshake } from 'lucide-react';
import clsx from 'clsx';

const NAV_ITEMS = [
  { name: 'Overview', href: '/', icon: LayoutDashboard },
  { name: 'Leaderboard', href: '/leaderboard', icon: Trophy },
  { name: 'Deals', href: '/deals', icon: Handshake },
  { name: 'Pipeline', href: '/pipeline', icon: GitMerge },
  { name: 'Geography', href: '/geography', icon: Map },
  { name: 'Reporting', href: '/reporting', icon: BarChart3 },
  { name: 'Compare', href: '/compare', icon: SplitSquareHorizontal },
];

function SpokeLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="currentColor" className={className}>
      <path d="M49.41 35.01L46.11 2.16L53.89 2.16L50.59 35.01Z"/>
      <path d="M53.31 35.37L58.62 2.78L66.14 4.80L54.45 35.67Z"/>
      <path d="M56.98 36.73L70.55 6.62L77.29 10.51L58.00 37.31Z"/>
      <path d="M60.18 38.99L81.08 13.42L86.58 18.92L61.01 39.82Z"/>
      <path d="M62.69 42.00L89.49 22.71L93.38 29.45L63.27 43.02Z"/>
      <path d="M64.33 45.55L95.20 33.86L97.22 41.38L64.63 46.69Z"/>
      <path d="M64.63 53.31L97.22 58.62L95.20 66.14L64.33 54.45Z"/>
      <path d="M63.27 56.98L93.38 70.55L89.49 77.29L62.69 58.00Z"/>
      <path d="M61.01 60.18L86.58 81.08L81.08 86.58L60.18 61.01Z"/>
      <path d="M58.00 62.69L77.29 89.49L70.55 93.38L56.98 63.27Z"/>
      <path d="M54.45 64.33L66.14 95.20L58.62 97.22L53.31 64.63Z"/>
      <path d="M50.59 64.99L53.89 97.84L46.11 97.84L49.41 64.99Z"/>
      <path d="M46.69 64.63L41.38 97.22L33.86 95.20L45.55 64.33Z"/>
      <path d="M43.02 63.27L29.45 93.38L22.71 89.49L42.00 62.69Z"/>
      <path d="M39.82 61.01L18.92 86.58L13.42 81.08L38.99 60.18Z"/>
      <path d="M37.31 58.00L10.51 77.29L6.62 70.55L36.73 56.98Z"/>
      <path d="M35.67 54.45L4.80 66.14L2.78 58.62L35.37 53.31Z"/>
      <path d="M35.01 50.59L2.16 53.89L2.16 46.11L35.01 49.41Z"/>
      <path d="M35.37 46.69L2.78 41.38L4.80 33.86L35.67 45.55Z"/>
      <path d="M36.73 43.02L6.62 29.45L10.51 22.71L37.31 42.00Z"/>
      <path d="M38.99 39.82L13.42 18.92L18.92 13.42L39.82 38.99Z"/>
      <path d="M42.00 37.31L22.71 10.51L29.45 6.62L43.02 36.73Z"/>
      <path d="M45.55 35.67L33.86 4.80L41.38 2.78L46.69 35.37Z"/>
    </svg>
  );
}

export function Sidebar({ onOpenFilters }: { onOpenFilters: () => void }) {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 bottom-0 z-40 w-16 hover:w-64 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] bg-panel/90 backdrop-blur-2xl border-r border-border-subtle flex flex-col group overflow-hidden shadow-2xl">
      <div className="flex h-16 shrink-0 items-center justify-center group-hover:justify-start group-hover:px-6 w-full relative">
        <SpokeLogo className="w-9 h-9 text-brand-pink-500 shrink-0 drop-shadow-[0_0_6px_rgba(218,26,132,0.5)]" />
        <span className="ml-3 text-white font-bold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-300 text-sm tracking-wide">
          Olive Hospitality
        </span>
      </div>

      <nav className="flex-1 mt-6 flex flex-col gap-2 px-2">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={clsx(
                "flex items-center w-full h-11 rounded-xl relative group/item transition-colors",
                isActive ? "bg-brand-purple-800/60" : "hover:bg-surface/50"
              )}
            >
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-brand-pink-500 rounded-r-full shadow-[0_0_10px_rgba(218,26,132,0.6)]" />
              )}
              <div className="w-12 h-full flex items-center justify-center shrink-0">
                <item.icon className={clsx(
                  "w-5 h-5 transition-colors",
                  isActive ? "text-brand-pink-400" : "text-text-secondary group-hover/item:text-brand-purple-300"
                )} />
              </div>
              <span className={clsx(
                "whitespace-nowrap text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-300",
                isActive ? "text-white" : "text-text-secondary group-hover/item:text-white"
              )}>
                {item.name}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto mb-4 px-2 flex flex-col gap-2">
        <button
          onClick={onOpenFilters}
          className="flex items-center w-full h-11 rounded-xl relative group/item hover:bg-surface/50 transition-colors md:hidden"
        >
          <div className="w-12 h-full flex items-center justify-center shrink-0">
            <Filter className="w-5 h-5 text-text-secondary group-hover/item:text-brand-purple-300" />
          </div>
          <span className="whitespace-nowrap text-sm font-medium text-text-secondary opacity-0 group-hover:opacity-100 transition-opacity duration-300 group-hover/item:text-white">
            Filters
          </span>
        </button>
      </div>
    </aside>
  );
}
