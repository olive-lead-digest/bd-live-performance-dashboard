'use client';

import { ArrowUpRight, ArrowDownRight, AlertCircle, Activity, Sparkles } from 'lucide-react';

export type SummaryTone = 'up' | 'down' | 'warn' | 'info';
export type SummaryBullet = { tone: SummaryTone; text: string };

/**
 * Shared "at a glance" strip shown at the top of every section so a viewer
 * (e.g. CEO / COO) reads the takeaways without needing the page explained.
 */
export function ExecSummary({ bullets, title = 'Executive Summary' }: { bullets: SummaryBullet[]; title?: string }) {
  if (!bullets || bullets.length === 0) return null;

  return (
    <div className="glass-panel p-4 sm:p-5 relative z-10 overflow-hidden mb-6">
      <div className="absolute inset-0 bg-gradient-to-r from-brand-purple-500/10 via-transparent to-brand-pink-500/[0.04] pointer-events-none" />
      <div className="flex items-center gap-2 mb-3 sm:mb-4 relative z-10">
        <Sparkles className="w-4 h-4 text-brand-pink-400 shrink-0" />
        <h2 className="text-xs font-bold uppercase tracking-widest text-white">{title}</h2>
        <span className="text-[9px] font-bold uppercase tracking-widest text-text-secondary bg-surface/60 px-2 py-0.5 rounded ml-1 hidden sm:inline">Auto-generated</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-2.5 sm:gap-y-3 relative z-10">
        {bullets.map((b, i) => {
          const Icon = b.tone === 'up' ? ArrowUpRight : b.tone === 'down' ? ArrowDownRight : b.tone === 'warn' ? AlertCircle : Activity;
          const color = b.tone === 'up' ? 'text-emerald-400' : b.tone === 'down' ? 'text-red-400' : b.tone === 'warn' ? 'text-amber-400' : 'text-brand-purple-300';
          return (
            <div key={i} className="flex items-start gap-2.5">
              <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${color}`} />
              <p className="text-sm text-white/90 leading-snug">{b.text}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
