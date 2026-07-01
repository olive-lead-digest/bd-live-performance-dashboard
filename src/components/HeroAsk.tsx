'use client';

import { useState, useEffect, useRef } from 'react';
import { Sparkles, ArrowRight, Loader2, Eraser } from 'lucide-react';
import { useDashboard } from '@/lib/DashboardContext';

const PHRASES = [
  'Ask anything about BD performance…',
  'Ask AI',
  'Why is Spark dropping?',
  'Who are the top BDs?',
  'Which region has the best active rate?',
  'Lowest performers in June, brand-wise?',
  'How is Olive trending month over month?',
];

const CHIPS = [
  'Why is Spark dropping?',
  'Top BDs?',
  'Best active-rate region?',
  'Lowest performers in June by brand',
];

const TYPE_SPEED = 55;
const DELETE_SPEED = 30;
const HOLD_MS = 1200;

export function HeroAsk() {
  const { data } = useDashboard();
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

  // Typewriter animation
  const [typed, setTyped] = useState('');
  const phraseIdx = useRef(0);
  const charIdx = useRef(0);
  const deleting = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const animate = query.length === 0 && !focused;

  useEffect(() => {
    if (!animate) {
      if (timer.current) clearTimeout(timer.current);
      return;
    }

    const tick = () => {
      const phrase = PHRASES[phraseIdx.current];
      if (!deleting.current) {
        charIdx.current += 1;
        setTyped(phrase.slice(0, charIdx.current));
        if (charIdx.current >= phrase.length) {
          deleting.current = true;
          timer.current = setTimeout(tick, HOLD_MS);
          return;
        }
        timer.current = setTimeout(tick, TYPE_SPEED);
      } else {
        charIdx.current -= 1;
        setTyped(phrase.slice(0, Math.max(0, charIdx.current)));
        if (charIdx.current <= 0) {
          deleting.current = false;
          phraseIdx.current = (phraseIdx.current + 1) % PHRASES.length;
          timer.current = setTimeout(tick, TYPE_SPEED);
          return;
        }
        timer.current = setTimeout(tick, DELETE_SPEED);
      }
    };

    timer.current = setTimeout(tick, TYPE_SPEED);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [animate]);

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
    <div className="glass-panel rounded-2xl p-4 sm:p-6 border border-brand-pink-500/30 shadow-[0_0_50px_rgba(218,26,132,0.2)] relative overflow-hidden z-20">
      <div className="absolute top-0 right-0 w-64 h-64 bg-brand-pink-500/10 blur-[100px] rounded-full pointer-events-none" />

      <div className="flex items-center gap-2 mb-4 relative z-10">
        <Sparkles className="w-5 h-5 text-brand-pink-500 shrink-0" />
        <span className="text-sm font-bold uppercase tracking-widest text-white">Ask AI</span>
      </div>

      {/* Input row — a real <form> so the mobile keyboard "Go/Send" and Enter both submit */}
      <form
        onSubmit={(e) => { e.preventDefault(); ask(query); }}
        className="relative flex items-center gap-1 rounded-xl bg-black/30 border border-border-subtle focus-within:border-brand-pink-500/50 transition-colors px-3 sm:px-4 py-1 z-10"
      >
        {loading ? <Loader2 className="w-5 h-5 text-brand-pink-500 shrink-0 animate-spin" /> : <Sparkles className="w-5 h-5 text-brand-pink-500 shrink-0" />}

        <div className="relative flex-1 min-w-0">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            type="text"
            inputMode="text"
            enterKeyHint="send"
            autoComplete="off"
            autoCorrect="off"
            aria-label="Ask a question about BD performance"
            placeholder={animate ? '' : 'Ask anything about BD performance…'}
            className="w-full bg-transparent border-none outline-none text-white placeholder:text-text-secondary px-3 sm:px-4 py-3 text-base min-w-0"
          />
          {animate && (
            <span className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 text-base text-text-secondary pointer-events-none truncate max-w-[calc(100%-1rem)]">
              {typed}<span className="animate-pulse">|</span>
            </span>
          )}
        </div>

        {query && (
          <button type="button" onClick={clearAll} title="Clear" aria-label="Clear input" className="p-2 rounded-md text-text-secondary hover:text-white hover:bg-surface transition-colors shrink-0">
            <Eraser className="w-4 h-4" />
          </button>
        )}
        <button type="submit" disabled={loading || !query.trim()} title="Ask" aria-label="Ask" className="p-2.5 rounded-md bg-brand-pink-500/20 text-brand-pink-400 hover:bg-brand-pink-500/30 disabled:opacity-40 transition-colors shrink-0">
          <ArrowRight className="w-4 h-4" />
        </button>
      </form>

      {/* Suggestion chips */}
      <div className="flex flex-wrap gap-2 mt-3 relative z-10">
        {CHIPS.map(c => (
          <button
            key={c}
            type="button"
            onClick={() => { setQuery(c); ask(c); }}
            className="px-3 py-1.5 rounded-full text-xs font-medium bg-brand-purple-900/40 border border-border-subtle text-text-secondary hover:text-white hover:border-brand-pink-500/40 transition-colors"
          >
            {c}
          </button>
        ))}
      </div>

      {/* Answer / loading / error */}
      {(loading || answer || error) && (
        <div className="mt-4 p-4 sm:p-5 rounded-xl border-t border-border-subtle bg-background/50 relative z-10">
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
  );
}
