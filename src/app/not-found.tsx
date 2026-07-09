import Link from 'next/link';
import { Compass, ArrowRight } from 'lucide-react';

// P2-6 — branded 404. Renders inside the app shell (sidebar + context bar) so a
// mistyped route lands in the dashboard's own visual style, not the unbranded
// Next.js default, and offers a clear path back to Overview.
export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] gap-6 text-center relative px-6">
      <div className="absolute top-[-80px] left-1/2 -translate-x-1/2 w-[500px] h-[400px] bg-brand-pink-500/10 rounded-full blur-[150px] pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center gap-6">
        <span className="w-16 h-16 rounded-2xl bg-brand-pink-500/15 border border-brand-pink-500/40 flex items-center justify-center shadow-[0_0_30px_rgba(218,26,132,0.25)]">
          <Compass className="w-8 h-8 text-brand-pink-400" />
        </span>

        <div className="flex flex-col items-center gap-2">
          <span className="text-6xl font-black text-white tracking-tight">404</span>
          <h1 className="text-lg font-bold text-white">Page not found</h1>
          <p className="text-sm text-text-secondary max-w-sm">
            That route doesn&apos;t exist in the BD dashboard. It may have moved during the
            navigation consolidation — head back to the Overview to get your bearings.
          </p>
        </div>

        <Link
          href="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-pink-500 text-white text-sm font-bold shadow-[0_0_20px_rgba(218,26,132,0.4)] hover:bg-brand-pink-600 transition-colors"
        >
          Go to Overview
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
