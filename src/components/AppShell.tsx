'use client';

import { useState, useEffect } from 'react';
import clsx from 'clsx';
import { Sidebar } from './Sidebar';
import { ContextBar } from './ContextBar';
import { FilterDrawer } from './FilterDrawer';
import { DrillProvider } from './DrillDrawer';

export function AppShell({ children }: { children: React.ReactNode }) {
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  // P2-1 — expanded labelled rail by default on >=1280px; collapse choice is
  // remembered across sessions via localStorage.
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem('nav-collapsed') === '1') setCollapsed(true);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleCollapse = () =>
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem('nav-collapsed', next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });

  return (
    <DrillProvider>
      {/* P2-6 — skip-to-content link: visually hidden until keyboard focus, then
          jumps past the nav to the main landmark (keyboard users no longer tab
          through 10 nav stops before reaching content). */}
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[200] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-brand-pink-500 focus:text-white focus:text-sm focus:font-bold focus:shadow-[0_0_20px_rgba(218,26,132,0.6)]"
      >
        Skip to content
      </a>
      <div className="min-h-screen bg-background text-foreground flex">
        <Sidebar
          onOpenFilters={() => setIsFiltersOpen(true)}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapse}
        />

        <div
          className={clsx(
            'flex-1 flex flex-col min-h-screen overflow-hidden pl-16 transition-[padding] duration-300',
            collapsed ? 'xl:pl-16' : 'xl:pl-64'
          )}
        >
          <ContextBar onOpenFilters={() => setIsFiltersOpen(true)} />

          <main id="content" className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-8">
            <div className="max-w-[1600px] mx-auto w-full">{children}</div>
          </main>
        </div>

        <FilterDrawer isOpen={isFiltersOpen} onClose={() => setIsFiltersOpen(false)} />
      </div>
    </DrillProvider>
  );
}
