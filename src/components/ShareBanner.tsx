'use client';

import { Link2 } from 'lucide-react';

/**
 * Slim, unobtrusive bar shown at the top of the content column when the page
 * is being viewed through the public share link rather than a signed-in
 * account. Deliberately quiet — it labels the context, it does not shout.
 * Matches the app's dark surface + brand-pink accent language.
 */
export function ShareBanner() {
  return (
    <div
      role="status"
      className="shrink-0 flex items-center gap-2 border-b border-brand-pink-500/25 bg-brand-pink-500/[0.07] px-3 py-2 sm:px-4 md:px-8"
    >
      <Link2 className="w-3.5 h-3.5 shrink-0 text-brand-pink-400" aria-hidden="true" />
      <p className="text-[11px] sm:text-xs leading-snug text-text-secondary min-w-0">
        <span className="font-bold text-brand-pink-300">Shared view</span>
        <span className="hidden sm:inline">
          {' '}
          — you&rsquo;re viewing the Olive BD dashboard through a shared link. All regions and brands are visible and
          Ask AI is available. Usage of this link is logged.
        </span>
        <span className="sm:hidden"> — all regions, via a shared link. Usage is logged.</span>
      </p>
    </div>
  );
}
