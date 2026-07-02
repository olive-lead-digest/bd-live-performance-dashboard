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

export function Sidebar({ onOpenFilters }: { onOpenFilters: () => void }) {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 bottom-0 z-40 w-16 hover:w-64 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] bg-panel/90 backdrop-blur-2xl border-r border-border-subtle flex flex-col group overflow-hidden shadow-2xl">
      <div className="flex h-16 shrink-0 items-center justify-center group-hover:justify-start group-hover:px-6 w-full relative">
        <span className="w-10 h-10 shrink-0 rounded-lg bg-white/95 flex items-center justify-center p-1 shadow-[0_0_12px_rgba(255,255,255,0.15)]">
          <img src="/olive-spoke-pink.svg" alt="Olive Hospitality" className="w-full h-full object-contain" />
        </span>
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
