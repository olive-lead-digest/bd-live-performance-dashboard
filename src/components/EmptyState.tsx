import { Inbox } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

// P3 — one reusable empty state so any filtered list/table that can yield zero
// rows shows explanatory copy instead of a blank void. Keep it visually quiet
// (dashed border, muted icon) so it reads as "nothing here yet", not an error.
export function EmptyState({
  title = 'Nothing to show',
  message = 'No records match the current filters. Try clearing or widening them.',
  icon: Icon = Inbox,
  action,
  className = '',
}: {
  title?: string;
  message?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={
        'flex flex-col items-center justify-center gap-3 text-center px-6 py-12 rounded-xl border border-dashed border-border-subtle bg-black/10 ' +
        className
      }
    >
      <span className="w-10 h-10 rounded-full bg-surface flex items-center justify-center border border-border-subtle">
        <Icon className="w-5 h-5 text-text-secondary" />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-bold text-white">{title}</p>
        <p className="text-xs text-text-secondary max-w-xs">{message}</p>
      </div>
      {action}
    </div>
  );
}
