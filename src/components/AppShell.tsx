'use client';

import { useState, useEffect } from 'react';
import clsx from 'clsx';
import { Sidebar } from './Sidebar';
import { ContextBar } from './ContextBar';
import { FilterDrawer } from './FilterDrawer';
import { DrillProvider } from './DrillDrawer';
import { MobileNav } from './MobileNav';
import { MobileContextHeader } from './MobileContextHeader';

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

  // P1-1 — allow any page (e.g. the Analytics date pill) to open the global
  // FilterDrawer via a custom window event, without prop-drilling the setter.
  useEffect(() => {
    const open = () => setIsFiltersOpen(true);
    window.addEventListener('olive:open-filters', open);
    return () => window.removeEventListener('olive:open-filters', open);
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
        className="skip-to-content px-4 py-2 rounded-lg bg-brand-pink-500 text-white text-sm font-bold shadow-[0_0_20px_rgba(218,26,132,0.6)]"
      >
        Skip to content
      </a>
      <div className="min-h-[100dvh] bg-background text-foreground flex">
        <Sidebar
          onOpenFilters={() => setIsFiltersOpen(true)}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapse}
        />

        <div
          className={clsx(
            'flex-1 flex flex-col min-h-[100dvh] overflow-hidden md:pl-16 transition-[padding] duration-300',
            collapsed ? 'xl:pl-16' : 'xl:pl-64'
          )}
        >
          <MobileContextHeader onOpenFilters={() => setIsFiltersOpen(true)} />
          <ContextBar onOpenFilters={() => setIsFiltersOpen(true)} />

          <main id="content" className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 md:p-8 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-8">
            <div className="max-w-[1600px] mx-auto w-full">{children}</div>
          </main>
        </div>

        <FilterDrawer isOpen={isFiltersOpen} onClose={() => setIsFiltersOpen(false)} />

        <MobileNav onOpenFilters={() => setIsFiltersOpen(true)} />
      </div>
    </DrillProvider>
  );
}
