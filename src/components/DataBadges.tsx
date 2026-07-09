'use client';

import { Info } from 'lucide-react';
import { useDashboard } from '@/lib/DashboardContext';

/**
 * P0-2 exemption badge. A deal-side module renders this when a filter is active
 * on a dimension the deal records cannot express (lead-tier, lead-status, city,
 * cluster, property-type). No module may ever LOOK filtered while showing
 * unfiltered data, so the whole deal side surfaces this badge (and dims slightly)
 * whenever such a filter is active.
 */
export function DealsExemptBadge({ className = '' }: { className?: string }) {
  const { dealsRuntime } = useDashboard();
  if (!dealsRuntime.filterActive || dealsRuntime.exemptDims.length === 0) return null;
  const dims = dealsRuntime.exemptDims.join(', ');
  return (
    <span
      className={
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-amber-500/40 bg-amber-500/10 ' +
        'text-amber-300 text-[9px] font-bold uppercase tracking-widest ' +
        className
      }
      title={`Deal records do not carry ${dims}, so this module is not affected by that filter.`}
    >
      <Info className="w-3 h-3" />
      Not affected by {dims} filter
    </span>
  );
}

/** True when the deal side should visually dim (an exempt-only situation). */
export function useDealsExempt() {
  const { dealsRuntime } = useDashboard();
  return dealsRuntime.filterActive && dealsRuntime.exemptDims.length > 0;
}

/**
 * P0-3 "Leads data as of …" stamp, mirroring the deals-side
 * "Real booked fees from Zoho Deals — as of …" stamp. Sourced from the feed's
 * `generated` timestamp, snapshotted once per page load in the context.
 */
export function LeadsAsOfStamp({ className = '' }: { className?: string }) {
  const { leadsAsOf } = useDashboard();
  if (!leadsAsOf) return null;
  return (
    <div className={'text-[10px] text-text-secondary italic ' + className}>
      Leads data as of {leadsAsOf} UTC
    </div>
  );
}
