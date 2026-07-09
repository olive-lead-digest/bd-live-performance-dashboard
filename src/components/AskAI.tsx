'use client';

import { useState } from 'react';
import { Sparkles, X, ArrowRight, Loader2, Eraser } from 'lucide-react';
import { useDashboard } from '@/lib/DashboardContext';

const SUGGESTIONS = [
  'Why is Spark dropping?',
  'Who are the top BDs?',
  'Which region has the best active rate?',
];

export function AskAI({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { data } = useDashboard();
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const clearAll = () => { setQuery(''); setAnswer(null); setError(null); };

  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || loading) return;
    setLoading(true); setError(null); setAnswer(null);
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, context: '' }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error || `Request failed (${res.status}).`);
      } else {
        setAnswer(typeof body?.answer === 'string' ? body.answer : 'No answer returned.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] transition-opacity" onClick={onClose} />
      <div className="fixed left-1/2 top-[12%] sm:top-[20%] -translate-x-1/2 w-[calc(100%-1.5rem)] max-w-2xl bg-panel/90 backdrop-blur-3xl border border-brand-pink-500/30 shadow-[0_0_50px_rgba(218,26,132,0.2)] rounded-2xl z-[110] overflow-hidden animate-in zoom-in-95 duration-200">

        <div className="relative flex items-center px-6 py-4 border-b border-border-subtle gap-1">
          {loading ? <Loader2 className="w-5 h-5 text-brand-pink-500 shrink-0 animate-spin" /> : <Sparkles className="w-5 h-5 text-brand-pink-500 shrink-0" />}
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') ask(query); }}
            placeholder="Ask anything about BD performance, e.g. 'Why is Spark dropping?'"
            className="flex-1 bg-transparent border-none outline-none text-white placeholder:text-text-secondary px-4 text-lg min-w-0"
          />
          {query && (
            <button onClick={clearAll} title="Clear" aria-label="Clear input" className="p-1.5 rounded-md text-text-secondary hover:text-white hover:bg-surface transition-colors shrink-0">
              <Eraser className="w-4 h-4" />
            </button>
          )}
          <button onClick={() => ask(query)} disabled={loading || !query.trim()} title="Ask" aria-label="Ask" className="p-1.5 rounded-md bg-brand-pink-500/20 text-brand-pink-400 hover:bg-brand-pink-500/30 disabled:opacity-40 transition-colors shrink-0">
            <ArrowRight className="w-4 h-4" />
          </button>
          <button onClick={onClose} title="Close" aria-label="Close" className="p-1 rounded-md hover:bg-surface text-text-secondary hover:text-white shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Suggestions (only before a question is asked) */}
        {!answer && !loading && !error && (
          <div className="p-2 bg-surface/50">
            <div className="text-xs font-semibold uppercase tracking-wider text-text-secondary px-4 py-2">Try asking</div>
            <div className="flex flex-col">
              {SUGGESTIONS.map(q => (
                <button key={q} onClick={() => { setQuery(q); ask(q); }} className="flex items-center justify-between px-4 py-3 rounded-lg hover:bg-brand-purple-900/40 group transition-colors text-left">
                  <span className="text-sm text-text-primary group-hover:text-white transition-colors">{q}</span>
                  <ArrowRight className="w-4 h-4 text-brand-purple-400 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Answer / loading / error */}
        {(loading || answer || error) && (
          <div className="p-6 border-t border-border-subtle bg-background/50 max-h-[55vh] overflow-y-auto">
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-brand-pink-500/20 border border-brand-pink-500/50 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-brand-pink-400" />
              </div>
              <div className="flex-1 min-w-0">
                {loading && <p className="text-sm text-text-secondary">Thinking…</p>}
                {error && <p className="text-sm text-red-400">{error}</p>}
                {answer && (
                  <>
                    <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">{answer}</p>
                    <p className="mt-3 text-[11px] text-text-secondary">
                      {data?.generated ? `Based on data last updated ${data.generated} UTC` : 'Based on the latest available data'}
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

      </div>
    </>
  );
}
