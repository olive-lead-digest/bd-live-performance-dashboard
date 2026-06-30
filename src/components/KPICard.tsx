import clsx from 'clsx';
import { LucideIcon } from 'lucide-react';

interface KPICardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  trend?: {
    value: string;
    isPositive: boolean;
  };
  highlight?: boolean;
}

export function KPICard({ title, value, subtitle, icon: Icon, trend, highlight }: KPICardProps) {
  return (
    <div className={clsx(
      "glass-panel p-6 relative overflow-hidden group flex flex-col justify-between transition-all duration-300",
      highlight ? "border-brand-pink-500/50 shadow-[0_0_20px_rgba(218,26,132,0.15)]" : "hover:border-brand-purple-500/50 hover:shadow-[0_0_20px_rgba(80,40,117,0.1)]"
    )}>
      {highlight && (
        <div className="absolute -inset-[100px] bg-gradient-to-tr from-brand-pink-500/10 to-transparent blur-3xl opacity-50 pointer-events-none" />
      )}
      
      <div className="flex items-start justify-between relative z-10">
        <h3 className="text-text-secondary text-xs font-semibold uppercase tracking-wider">{title}</h3>
        <div className={clsx(
          "w-8 h-8 rounded-full flex items-center justify-center border",
          highlight ? "bg-brand-pink-500/20 border-brand-pink-500/50 text-brand-pink-400 shadow-[0_0_10px_rgba(218,26,132,0.4)]" : "bg-brand-purple-800/50 border-brand-purple-500/30 text-brand-purple-300 group-hover:text-brand-pink-300 group-hover:border-brand-pink-500/50 transition-colors"
        )}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      
      <div className="mt-4 relative z-10">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-black text-white tracking-tight">{value}</span>
          {trend && (
            <span className={clsx(
              "text-xs font-bold px-1.5 py-0.5 rounded flex items-center",
              trend.isPositive ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-red-500/20 text-red-400 border border-red-500/30"
            )}>
              {trend.isPositive ? '↑' : '↓'} {trend.value}
            </span>
          )}
        </div>
        {subtitle && (
          <p className="text-xs text-text-secondary font-medium mt-2">{subtitle}</p>
        )}
      </div>
    </div>
  );
}
