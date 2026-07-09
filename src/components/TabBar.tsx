'use client';

import clsx from 'clsx';

export interface TabDef {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
}

export function TabBar({
  tabs,
  active,
  onChange,
  className = '',
}: {
  tabs: TabDef[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        'flex items-center gap-1 p-1 rounded-xl bg-black/30 border border-border-subtle w-fit max-w-full overflow-x-auto no-scrollbar',
        className
      )}
    >
      {tabs.map((t) => {
        const Icon = t.icon;
        const on = active === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={clsx(
              'flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-[11px] sm:text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap',
              on
                ? 'bg-brand-pink-500 text-white shadow-[0_0_12px_rgba(218,26,132,0.4)]'
                : 'text-text-secondary hover:text-white hover:bg-surface/50'
            )}
          >
            {Icon && <Icon className="w-3.5 h-3.5" />}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
