'use client';

// ---------------------------------------------------------------------------
// Shared mobile primitives (P-mobile).
//
// Below `md` the wide desktop tables re-render as a vertical stack of these
// cards: a primary entity + a headline KPI shown prominently, 2–3 secondary
// indicators, and a tap-to-expand accordion (pure CSS grid-rows height
// transition — no framer-motion) for the remaining metrics. At `md+` these
// components are never rendered (the original <table> shows instead), so the
// desktop layout is completely unchanged.
//
// InfoNote moves long disclaimers / formula notes behind a compact ⓘ toggle on
// mobile while keeping them always-on at md+.
// ---------------------------------------------------------------------------

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ArrowRight, Info, X } from 'lucide-react';
import clsx from 'clsx';
import { useDialog } from '@/lib/useDialog';

export interface StatRow {
  label: string;
  value: React.ReactNode;
  accent?: string;
}

export function MobileStatCard({
  badge,
  title,
  subtitle,
  headlineLabel,
  headline,
  headlineAccent,
  secondary = [],
  details = [],
  onOpen,
  openLabel = 'View details',
  accentBar,
  className,
}: {
  badge?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  headlineLabel?: string;
  headline: React.ReactNode;
  headlineAccent?: string;
  secondary?: StatRow[];
  details?: StatRow[];
  onOpen?: () => void;
  openLabel?: string;
  accentBar?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const hasDetails = details.length > 0;
  const interactive = hasDetails || !!onOpen;

  const handlePrimary = () => {
    if (hasDetails) setOpen((o) => !o);
    else if (onOpen) onOpen();
  };

  return (
    <div className={clsx('relative glass-card p-4 overflow-hidden', className)}>
      {accentBar && (
        <span className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: accentBar }} aria-hidden="true" />
      )}

      <div
        role={interactive ? 'button' : undefined}
        tabIndex={interactive ? 0 : undefined}
        aria-expanded={hasDetails ? open : undefined}
        onClick={interactive ? handlePrimary : undefined}
        onKeyDown={
          interactive
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handlePrimary();
                }
              }
            : undefined
        }
        className={clsx(
          'min-h-[44px] rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-400',
          interactive && 'cursor-pointer'
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {badge}
            <div className="min-w-0">
              <div className="text-[15px] font-bold text-white leading-tight break-words line-clamp-2">{title}</div>
              {subtitle != null && subtitle !== '' && (
                <div className="text-xs text-text-secondary leading-tight line-clamp-2 mt-0.5">{subtitle}</div>
              )}
            </div>
          </div>
          <div className="text-right shrink-0">
            {headlineLabel && (
              <div className="text-xs uppercase tracking-wider font-bold text-text-secondary leading-none mb-1">
                {headlineLabel}
              </div>
            )}
            <div className="text-xl font-black leading-none tabular-nums" style={{ color: headlineAccent || '#ffffff' }}>
              {headline}
            </div>
          </div>
        </div>

        {secondary.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {secondary.map((s, i) => (
              <div key={i} className="flex flex-col gap-0.5 min-w-0">
                <span className="text-xs uppercase tracking-wider font-bold text-text-secondary truncate">{s.label}</span>
                <span className="text-sm font-bold tabular-nums truncate" style={{ color: s.accent || '#ffffff' }}>
                  {s.value}
                </span>
              </div>
            ))}
          </div>
        )}

        {interactive && (
          <div className="mt-2 flex items-center gap-1 text-xs font-semibold text-text-secondary">
            {hasDetails ? (
              <>
                <ChevronDown className={clsx('w-4 h-4 transition-transform duration-300', open && 'rotate-180')} />
                <span>{open ? 'Show less' : 'More metrics'}</span>
              </>
            ) : (
              <>
                <span className="text-brand-pink-400">{openLabel}</span>
                <ArrowRight className="w-3.5 h-3.5 text-brand-pink-400" />
              </>
            )}
          </div>
        )}
      </div>

      {hasDetails && (
        <div className={clsx('grid transition-[grid-template-rows] duration-300 ease-out', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
          <div className="overflow-hidden">
            <div
              className={clsx(
                'mt-3 pt-3 border-t border-border-subtle/60 grid grid-cols-2 gap-x-4 gap-y-2.5 transition-opacity duration-300',
                open ? 'opacity-100' : 'opacity-0'
              )}
            >
              {details.map((d, i) => (
                <div key={i} className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-xs text-text-secondary truncate">{d.label}</span>
                  <span className="text-sm font-bold tabular-nums truncate" style={{ color: d.accent || '#ffffff' }}>
                    {d.value}
                  </span>
                </div>
              ))}
            </div>
            {onOpen && (
              <button
                type="button"
                onClick={onOpen}
                className="mt-3 inline-flex items-center gap-1.5 min-h-[44px] px-3 -ml-3 rounded-lg text-xs font-semibold text-brand-pink-400 hover:text-brand-pink-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-400"
              >
                {openLabel}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Long disclaimers / methodology / data-source strings: shown inline at md+
// (desktop unchanged) but moved BEHIND a compact ⓘ trigger below md, where the
// reveal is a lightweight, dismissible bottom-sheet modal (animated, focus-
// trapped, >=12px text) instead of an always-on wall of text. Pass the copy
// once; the desktop inline note and the mobile sheet share it. `desktopClassName`
// carries the exact classes the original inline note used; a <div> (not <p>)
// wrapper lets callers pass multi-block content without invalid nesting, and
// plain-text callers render identically. The sheet is portalled to <body> so a
// card's backdrop-blur / overflow can never clip it.
export function InfoNote({
  children,
  desktopClassName,
  mobileLabel = 'Details & methodology',
  title = 'Details',
}: {
  children: React.ReactNode;
  desktopClassName?: string;
  mobileLabel?: string;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const sheetRef = useDialog<HTMLDivElement>(() => setOpen(false), open);

  return (
    <>
      {desktopClassName !== undefined && (
        <div className={clsx('hidden md:block', desktopClassName)}>{children}</div>
      )}

      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="inline-flex items-center gap-1.5 min-h-[44px] px-2 -ml-2 rounded-lg text-xs font-semibold text-text-secondary hover:text-brand-pink-400 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-400"
        >
          <Info className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          {mobileLabel}
        </button>
      </div>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="md:hidden fixed inset-0 z-[60]">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />
            <div
              ref={sheetRef}
              role="dialog"
              aria-modal="true"
              aria-label={title}
              tabIndex={-1}
              className="absolute inset-x-0 bottom-0 glass-panel rounded-t-2xl rounded-b-none border-b-0 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-[0_-20px_60px_rgba(0,0,0,0.6)] animate-sheet-up focus:outline-none max-h-[80dvh] flex flex-col"
            >
              <div className="flex items-center justify-between mb-2 shrink-0">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-white">
                  <Info className="w-3.5 h-3.5 text-brand-pink-400" aria-hidden="true" />
                  {title}
                </span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="w-11 h-11 -mr-2 flex items-center justify-center rounded-lg text-text-secondary hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-400"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="overflow-y-auto no-scrollbar text-xs leading-relaxed text-text-secondary not-italic normal-case tracking-normal space-y-2">
                {children}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
