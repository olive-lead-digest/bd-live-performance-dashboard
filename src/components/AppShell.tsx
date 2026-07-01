'use client';

import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { ContextBar } from './ContextBar';
import { FilterDrawer } from './FilterDrawer';

export function AppShell({ children }: { children: React.ReactNode }) {
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      <Sidebar onOpenFilters={() => setIsFiltersOpen(true)} />
      
      <div className="flex-1 pl-16 flex flex-col min-h-screen overflow-hidden">
        <ContextBar onOpenFilters={() => setIsFiltersOpen(true)} />
        
        <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-8">
          <div className="max-w-[1600px] mx-auto w-full">
            {children}
          </div>
        </main>
      </div>

      <FilterDrawer 
        isOpen={isFiltersOpen} 
        onClose={() => setIsFiltersOpen(false)} 
      />
    </div>
  );
}
