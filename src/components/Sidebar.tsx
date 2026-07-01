'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Trophy, GitMerge, Map, Users, Settings, Filter, SplitSquareHorizontal, BarChart3 } from 'lucide-react';
import clsx from 'clsx';

const NAV_ITEMS = [
  { name: 'Overview', href: '/', icon: LayoutDashboard },
  { name: 'Leaderboard', href: '/leaderboard', icon: Trophy },
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
        <span className="w-8 h-8 text-brand-pink-500 shrink-0">
          <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" strokeWidth="3.10" strokeLinecap="round">
            <line x1="50.00" y1="30.00" x2="50.00" y2="3.00" />
            <line x1="54.79" y1="30.58" x2="61.25" y2="4.37" />
            <line x1="59.29" y1="32.29" x2="71.84" y2="8.38" />
            <line x1="63.26" y1="35.03" x2="81.17" y2="14.82" />
            <line x1="66.46" y1="38.64" x2="88.68" y2="23.30" />
            <line x1="68.70" y1="42.91" x2="93.95" y2="33.33" />
            <line x1="69.85" y1="47.59" x2="96.66" y2="44.33" />
            <line x1="69.85" y1="52.41" x2="96.66" y2="55.67" />
            <line x1="68.70" y1="57.09" x2="93.95" y2="66.67" />
            <line x1="66.46" y1="61.36" x2="88.68" y2="76.70" />
            <line x1="63.26" y1="64.97" x2="81.17" y2="85.18" />
            <line x1="59.29" y1="67.71" x2="71.84" y2="91.62" />
            <line x1="54.79" y1="69.42" x2="61.25" y2="95.63" />
            <line x1="50.00" y1="70.00" x2="50.00" y2="97.00" />
            <line x1="45.21" y1="69.42" x2="38.75" y2="95.63" />
            <line x1="40.71" y1="67.71" x2="28.16" y2="91.62" />
            <line x1="36.74" y1="64.97" x2="18.83" y2="85.18" />
            <line x1="33.54" y1="61.36" x2="11.32" y2="76.70" />
            <line x1="31.30" y1="57.09" x2="6.05" y2="66.67" />
            <line x1="31.30" y1="42.91" x2="6.05" y2="33.33" />
            <line x1="33.54" y1="38.64" x2="11.32" y2="23.30" />
            <line x1="36.74" y1="35.03" x2="18.83" y2="14.82" />
            <line x1="40.71" y1="32.29" x2="28.16" y2="8.38" />
            <line x1="45.21" y1="30.58" x2="38.75" y2="4.37" />
          </svg>
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
