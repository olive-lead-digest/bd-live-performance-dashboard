'use client';

import { useState } from 'react';
import { Search, Sparkles, X, ArrowRight } from 'lucide-react';
import clsx from 'clsx';

export function AskAI({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] transition-opacity" onClick={onClose} />
      <div className="fixed left-1/2 top-[12%] sm:top-[20%] -translate-x-1/2 w-[calc(100%-1.5rem)] max-w-2xl bg-panel/90 backdrop-blur-3xl border border-brand-pink-500/30 shadow-[0_0_50px_rgba(218,26,132,0.2)] rounded-2xl z-[110] overflow-hidden animate-in zoom-in-95 duration-200">
        
        <div className="relative flex items-center px-6 py-4 border-b border-border-subtle">
          <Sparkles className="w-5 h-5 text-brand-pink-500 shrink-0" />
          <input 
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Ask anything about BD performance, e.g. 'Why is spark dropping?'"
            className="flex-1 bg-transparent border-none outline-none text-white placeholder:text-text-secondary px-4 text-lg"
          />
          <button onClick={onClose} className="p-1 rounded-md hover:bg-surface text-text-secondary hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-2 bg-surface/50">
          <div className="text-xs font-semibold uppercase tracking-wider text-text-secondary px-4 py-2">
            Suggested Queries
          </div>
          <div className="flex flex-col">
            {[
              "Show me reps with high drop rates and low QA scores.",
              "Compare conversion rates for Spark vs Olive in Bangalore.",
              "Who needs coaching on 'Objection Handling'?"
            ].map(q => (
              <button key={q} onClick={() => setQuery(q)} className="flex items-center justify-between px-4 py-3 rounded-lg hover:bg-brand-purple-900/40 group transition-colors text-left">
                <span className="text-sm text-text-primary group-hover:text-white transition-colors">{q}</span>
                <ArrowRight className="w-4 h-4 text-brand-purple-400 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
              </button>
            ))}
          </div>
        </div>

        {query && (
          <div className="p-6 border-t border-border-subtle bg-background/50">
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-brand-pink-500/20 border border-brand-pink-500/50 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-brand-pink-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-text-primary leading-relaxed">
                  The natural-language assistant isn&apos;t connected to a backend yet, so I can&apos;t answer
                  &ldquo;{query}&rdquo; here.
                  <br/><br/>
                  <span className="text-xs text-brand-purple-300">In the meantime, use the filters and the Reporting, Compare, Leaderboard and Geography pages — they cover this from live data.</span>
                </p>
              </div>
            </div>
          </div>
        )}

      </div>
    </>
  );
}
