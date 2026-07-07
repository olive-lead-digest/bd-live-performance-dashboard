'use client';

import { useDashboard } from '@/lib/DashboardContext';
import { TrendingUp } from 'lucide-react';
import { PortfolioFiscalCard } from '@/components/PortfolioFiscalCard';
import { UpcomingSigningsCard } from '@/components/UpcomingSigningsCard';

export default function PerformancePage() {
  const { data, isLoading } = useDashboard();

  if (isLoading || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 relative z-10">
        <div className="w-16 h-16 border-4 border-brand-purple-500/20 border-t-brand-pink-500 rounded-full animate-spin shadow-[0_0_30px_rgba(218,26,132,0.4)]" />
        <div className="text-white font-bold tracking-widest uppercase text-sm animate-pulse">Loading performance</div>
      </div>
    );
  }

  const hasAny = data.deals?.portfolio || data.deals?.ytd || data.deals?.mtd || Array.isArray(data.deals?.upcoming);

  return (
    <div className="flex flex-col gap-4 sm:gap-6 pb-20 relative">
      <div className="absolute top-[-100px] left-[-100px] w-[500px] h-[500px] bg-brand-pink-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-[20%] right-[-100px] w-[600px] h-[600px] bg-brand-purple-500/10 rounded-full blur-[150px] pointer-events-none" />

      <header className="mb-2 relative z-10">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-white tracking-tight flex flex-wrap items-center gap-x-3 gap-y-2">
          Performance
          <span className="px-2 py-0.5 rounded bg-brand-pink-500/20 border border-brand-pink-500/50 text-brand-pink-400 text-[10px] uppercase tracking-widest">
            Portfolio &amp; Fiscal
          </span>
        </h1>
        <p className="text-text-secondary text-sm mt-1 font-medium">
          Signed portfolio, fiscal signings &amp; collections, and high-probability upcoming signings.
        </p>
      </header>

      <PortfolioFiscalCard />
      <UpcomingSigningsCard />

      {!hasAny && (
        <div className="flex flex-col items-center justify-center gap-4 relative z-10 text-center px-6 py-20">
          <TrendingUp className="w-10 h-10 text-brand-purple-400" />
          <div className="text-text-secondary text-sm">Performance data is loading or unavailable.</div>
        </div>
      )}
    </div>
  );
}
