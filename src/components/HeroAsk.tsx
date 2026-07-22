'use client';

import { useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Sparkles, ArrowRight, Loader2, Eraser, Copy, Check, CornerDownRight } from 'lucide-react';
import { useDashboard } from '@/lib/DashboardContext';
import { isRelevantQuery, ASK_SUGGESTIONS } from '@/lib/askGuard';

const PHRASES = [
  'Ask anything about BD performance…',
  'Ask AI',
  'How many MAs has Spark signed?',
  'Collections this financial year?',
  'Top BDs by signings?',
  'Which region has the best active rate?',
  'How is Olive trending month over month?',
];

// P0-1: the assistant is now grounded on the full feed — leads AND signings/
// deals (MAs, LOIs, TA fees, collections, BD ranking) AND proposals/approvals.
// So the chip pool mixes leads + deals + proposals questions that are all
// answerable; nothing here points at data the model can't back with numbers.
// P3 — a larger pool the 3 visible chips rotate through (Overview-relevant,
// since HeroAsk lives on the Overview page).
const CHIP_POOL = [
  'How many MAs has Spark signed?',
  'Collections this financial year?',
  'Top BDs by signings?',
  'Best active-rate region?',
  'Why are leads dropping in North?',
  'Proposal approval rate by department?',
  'Upcoming signings in the next 20 days?',
  'How is Olive trending month over month?',
];

const TYPE_SPEED = 55;
const DELETE_SPEED = 30;
const HOLD_MS = 1200;

// ---- Tiny inline Markdown renderer (no dependencies) ----
function renderInline(text: string, keyPrefix: string) {
  const parts = text.split(/\*\*(.+?)\*\*/);
  return parts.map((part, i) =>
    i % 2 === 1
      ? <strong key={`${keyPrefix}-${i}`} className="text-white font-semibold">{part}</strong>
      : <span key={`${keyPrefix}-${i}`}>{part}</span>
  );
}

function renderAnswer(md: string) {
  const lines = md.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  let headlineUsed = false;

  const flushBullets = () => {
    if (!bullets.length) return;
    const items = bullets;
    bullets = [];
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="space-y-2 my-1">
        {items.map((b, i) => (
          <li key={i} className="flex gap-2.5 text-sm text-text-primary leading-relaxed">
            <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-brand-pink-400 shrink-0" />
            <span>{renderInline(b, `li-${blocks.length}-${i}`)}</span>
          </li>
        ))}
      </ul>
    );
  };

  lines.forEach((line, idx) => {
    const boldWrap = line.match(/^\*\*(.+?)\*\*:?\s*(.*)$/);
    const isBottomLine = /^\*\*\s*Bottom line/i.test(line) || /^Bottom line/i.test(line);

    if (line.startsWith('- ')) {
      bullets.push(line.slice(2).trim());
      return;
    }
    flushBullets();

    if (isBottomLine) {
      blocks.push(
        <div
          key={`bl-${idx}`}
          className="mt-3 rounded-xl bg-brand-pink-500/10 border border-brand-pink-500/30 px-4 py-3 text-sm text-text-primary leading-relaxed"
        >
          {renderInline(line.replace(/\*\*/g, ''), `bl-${idx}`)}
        </div>
      );
      return;
    }

    if (!headlineUsed && boldWrap && boldWrap[1] && !boldWrap[2]) {
      headlineUsed = true;
      blocks.push(
        <p key={`h-${idx}`} className="text-base font-bold text-white leading-snug">
          {renderInline(boldWrap[1], `h-${idx}`)}
        </p>
      );
      return;
    }

    blocks.push(
      <p key={`p-${idx}`} className="text-sm text-text-primary leading-relaxed">
        {renderInline(line, `p-${idx}`)}
      </p>
    );
  });
  flushBullets();

  return <div className="space-y-2.5">{blocks}</div>;
}

export function HeroAsk() {
  const { data } = useDashboard();
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  // P1-9 (1) — graceful fallback for off-topic / unrecognisable input.
  const [fallback, setFallback] = useState<{ message: string; suggestions: string[] } | null>(null);
  // P3 — copy-answer feedback, follow-up input, and rotating suggestion chips.
  const [copied, setCopied] = useState(false);
  const [followUp, setFollowUp] = useState('');
  const [chipOffset, setChipOffset] = useState(0);
  // P0-1 (G) — the question the on-screen answer is responding to. Ask AI is
  // single-turn (a new question replaces the last answer); showing the question
  // above the answer makes that replacement clear instead of feeling like lost
  // chat history.
  const [askedQuestion, setAskedQuestion] = useState('');

  const [typed, setTyped] = useState('');
  const phraseIdx = useRef(0);
  const charIdx = useRef(0);
  const deleting = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // M4 — when the mobile virtual keyboard opens, re-centre the focused field so
  // it (and the answer scrolling above it) stay visible above the keyboard. The
  // panel is in normal flow (never position:fixed), so nothing is trapped under
  // the keyboard; the answer area scrolls internally (max-h below).
  const keepInView = (el: HTMLElement | null) => {
    if (!el) return;
    setTimeout(() => { try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch { /* noop */ } }, 250);
  };

  // Mobile "Ask AI" entry (bottom nav / deep link). Scrolls the input into view
  // and focuses it, then strips the one-shot ?ask=1 param so a later refresh
  // does not re-trigger it. Driven by /?ask=1 on cross-page navigation and by an
  // olive:ask-focus window event when Ask AI is tapped while already on Overview.
  const focusAsk = () => {
    const el = inputRef.current;
    if (el) { try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch { /* noop */ } }
    setTimeout(() => {
      if (el) { try { el.focus({ preventScroll: true }); } catch { /* noop */ } }
      try {
        const p = new URLSearchParams(window.location.search);
        if (p.get('ask')) {
          p.delete('ask');
          const qs = p.toString();
          window.history.replaceState(window.history.state, '', qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
        }
      } catch { /* ignore */ }
    }, 350);
  };

  useEffect(() => {
    let hit = false;
    try { hit = new URLSearchParams(window.location.search).get('ask') === '1'; } catch { /* ignore */ }
    if (hit) focusAsk();
    const onAskFocus = () => focusAsk();
    window.addEventListener('olive:ask-focus', onAskFocus);
    return () => window.removeEventListener('olive:ask-focus', onAskFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // P3 — rotate the 3 visible chips through the pool while idle (pauses once an
  // answer is on screen so it never shifts under the reader).
  useEffect(() => {
    if (loading || answer) return;
    const id = setInterval(() => setChipOffset((o) => (o + 3) % CHIP_POOL.length), 6000);
    return () => clearInterval(id);
  }, [loading, answer]);
  const visibleChips = [0, 1, 2].map((i) => CHIP_POOL[(chipOffset + i) % CHIP_POOL.length]);

  const clearAll = () => { setQuery(''); setAnswer(null); setError(null); setFallback(null); setFollowUp(''); setCopied(false); setAskedQuestion(''); };

  const copyAnswer = async () => {
    if (!answer) return;
    try {
      await navigator.clipboard.writeText(answer);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — no-op */
    }
  };

  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || loading) return;

    // P1-9 (1) — client-side relevance guard: catch obvious gibberish before a
    // network round-trip. The server enforces the same check, so this can't be
    // bypassed — it just makes the fallback instant for clear non-questions.
    if (!isRelevantQuery(question)) {
      setLoading(false); setError(null); setAnswer(null);
      setFallback({ message: "I couldn't map that to BD data — try one of these:", suggestions: ASK_SUGGESTIONS });
      return;
    }

    setLoading(true); setError(null); setAnswer(null); setFallback(null); setAskedQuestion(question);
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, context: '' }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error || `Request failed (${res.status}).`);
      } else if (body?.fallback) {
        // Server-side relevance guard tripped.
        setFallback({
          message: typeof body?.message === 'string' ? body.message : "I couldn't map that to BD data — try one of these:",
          suggestions: Array.isArray(body?.suggestions) && body.suggestions.length ? body.suggestions : ASK_SUGGESTIONS,
        });
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
    <div className="glass-panel rounded-2xl p-5 sm:p-8 border border-brand-pink-500/30 shadow-[0_0_70px_rgba(218,26,132,0.28)] relative overflow-hidden z-20">
      <div className="absolute top-0 right-0 w-72 h-72 bg-brand-pink-500/15 blur-[110px] rounded-full pointer-events-none" />
      <div className="absolute -bottom-10 -left-10 w-56 h-56 bg-brand-purple-500/10 blur-[100px] rounded-full pointer-events-none" />

      <div className="flex items-center gap-2 mb-4 relative z-10">
        <Sparkles className="w-6 h-6 text-brand-pink-500 shrink-0" />
        <span className="text-base sm:text-lg font-bold uppercase tracking-widest text-white">Ask AI</span>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); ask(query); }}
        className="relative flex items-center gap-1 rounded-xl bg-black/30 border border-border-subtle focus-within:border-brand-pink-500/60 focus-within:shadow-[0_0_25px_rgba(218,26,132,0.2)] transition-all px-3 sm:px-5 py-1.5 z-10"
      >
        {loading ? <Loader2 className="w-5 h-5 text-brand-pink-500 shrink-0 animate-spin" /> : <Sparkles className="w-5 h-5 text-brand-pink-500 shrink-0" />}

        <div className="relative flex-1 min-w-0">
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={(e) => { setFocused(true); keepInView(e.currentTarget); }}
            onBlur={() => setFocused(false)}
            type="text"
            inputMode="text"
            enterKeyHint="send"
            autoComplete="off"
            autoCorrect="off"
            aria-label="Ask a question about BD performance"
            placeholder={animate ? '' : 'Ask anything about BD performance…'}
            className="w-full bg-transparent border-none outline-none text-white placeholder:text-text-secondary px-3 sm:px-4 py-4 text-base sm:text-lg min-w-0"
          />
          {animate && (
            <span className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 text-base sm:text-lg text-text-secondary pointer-events-none truncate max-w-[calc(100%-1rem)]">
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

      <div className="flex flex-wrap gap-2 mt-3 relative z-10">
        {visibleChips.map((c) => (
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

      {/* P0-1 (E) — scope helper next to the INPUT (not just appended to
          answers). Ask AI reads the whole dataset and ignores the dashboard's
          active filters, so we say that plainly and stamp data freshness. */}
      <p className="mt-2 text-[11px] text-text-secondary/80 leading-relaxed relative z-10">
        Answers cover all brands &amp; regions — not your current dashboard filters.
        {data?.generated ? ` Data as of ${data.generated} UTC.` : ''}
      </p>

      {(loading || answer || error || fallback) && (
        <div className="mt-4 p-4 sm:p-5 rounded-xl border-t border-border-subtle bg-background/50 relative z-10">
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-brand-pink-500/20 border border-brand-pink-500/50 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-brand-pink-400" />
            </div>
            <div className="flex-1 min-w-0">
              {loading && <p className="text-sm text-text-secondary">Thinking…</p>}
              {error && <p className="text-sm text-red-400">{error}</p>}

              {/* P1-9 (1) — graceful fallback: no fabricated analysis, just a
                  clear message and the suggestion chips. */}
              {fallback && (
                <>
                  <p className="text-sm text-text-primary leading-relaxed">{fallback.message}</p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {fallback.suggestions.map(s => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => { setQuery(s); ask(s); }}
                        className="px-3 py-1.5 rounded-full text-xs font-medium bg-brand-purple-900/40 border border-border-subtle text-text-secondary hover:text-white hover:border-brand-pink-500/40 transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {answer && (
                <>
                  {/* P0-1 (G) — label the answer with the question it answers so
                      single-turn replacement never feels like lost history.
                      P3 — copy the raw answer to the clipboard. */}
                  <div className="flex items-center justify-between gap-3 -mt-1 mb-1.5">
                    <p className="text-[11px] uppercase tracking-wider text-text-secondary/70 truncate min-w-0">
                      Answer{askedQuestion ? <> · <span className="normal-case text-text-secondary">{askedQuestion}</span></> : ''}
                    </p>
                    <button
                      type="button"
                      onClick={copyAnswer}
                      aria-label="Copy answer"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold text-text-secondary hover:text-white hover:bg-surface transition-colors shrink-0"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <div className="max-h-[60dvh] overflow-y-auto no-scrollbar pr-1">
                    {renderAnswer(answer)}
                  </div>
                  {/* P0-1 (E) — short, non-alarming scope stamp under the
                      answer; the full scope note lives beside the input above. */}
                  <p className="mt-4 pt-3 border-t border-border-subtle/60 text-[11px] text-text-secondary leading-relaxed">
                    Covers all brands &amp; regions{data?.generated ? ` · data as of ${data.generated} UTC` : ''}
                  </p>
                  {/* P3 — ask a follow-up inline without scrolling back up. */}
                  <form
                    onSubmit={(e) => { e.preventDefault(); const q = followUp.trim(); if (q) { setQuery(q); ask(q); setFollowUp(''); } }}
                    className="mt-3 flex items-center gap-2 rounded-lg bg-black/30 border border-border-subtle focus-within:border-brand-pink-500/50 transition-colors px-3 py-1.5"
                  >
                    <CornerDownRight className="w-4 h-4 text-text-secondary shrink-0" />
                    <input
                      value={followUp}
                      onChange={(e) => setFollowUp(e.target.value)}
                      onFocus={(e) => keepInView(e.currentTarget)}
                      type="text"
                      aria-label="Ask a follow-up question"
                      placeholder="Ask a follow-up…"
                      className="flex-1 bg-transparent border-none outline-none text-base md:text-sm text-white placeholder:text-text-secondary py-1.5 min-w-0"
                    />
                    <button
                      type="submit"
                      disabled={loading || !followUp.trim()}
                      aria-label="Send follow-up"
                      className="p-1.5 rounded-md bg-brand-pink-500/20 text-brand-pink-400 hover:bg-brand-pink-500/30 disabled:opacity-40 transition-colors shrink-0"
                    >
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
