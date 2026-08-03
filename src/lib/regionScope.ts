import { computeDealsRuntime } from './dealsRuntime';
import { calculateRates } from './utils';
import type { Filters } from './DashboardContext';
import type { Lead } from './types';
import type { Scope } from './auth';

function regionFilters(regions: string[]): Filters {
  return {
    from: '',
    to: '',
    presetLabel: '',
    region: new Set(regions),
    state: new Set(),
    city: new Set(),
    cluster: new Set(),
    brand: new Set(),
    status: new Set(),
    prop: new Set(),
    owner: new Set(),
  } as Filters;
}

function filterKeyedByRegion(obj: unknown, allowed: Set<string>): Record<string, unknown> {
  if (!obj || typeof obj !== 'object') return {};
  return Object.fromEntries(Object.entries(obj as Record<string, unknown>).filter(([r]) => allowed.has(r)));
}

function filterOrg(org: any, allowed: Set<string>) {
  if (!org || typeof org !== 'object') return org;
  const out: any = { generated: org.generated, note: org.note };
  if (org.regionHeads) out.regionHeads = filterKeyedByRegion(org.regionHeads, allowed);
  if (org.regions) out.regions = filterKeyedByRegion(org.regions, allowed);
  if (org.bds && typeof org.bds === 'object') {
    out.bds = Object.fromEntries(
      Object.entries(org.bds as Record<string, any>).filter(([, v]) => v && v.region && allowed.has(v.region))
    );
  }
  return out;
}

function filterRankingArray(arr: unknown, allowed: Set<string>) {
  if (!Array.isArray(arr)) return arr;
  return arr.filter((r: any) => r && r.region && allowed.has(r.region));
}

/**
 * Restricts a merged /api/dashboard payload (dashboard_data.json + deals.json
 * + proposals.json + bd_org.json) to a region-scoped caller's allowed
 * region(s). Full-access callers pass through untouched.
 *
 * Every array that carries a region (directly, or indirectly via a BD's org
 * directory region) is filtered, and every aggregate derived from those
 * arrays is RECOMPUTED from the filtered rows — never left as an org-wide
 * total sitting next to a filtered list. Anything that cannot be safely
 * scoped is withheld entirely rather than guessed at or shown unfiltered
 * ("withhold rather than fabricate"):
 *   - `proposals`: the feed carries no per-proposal/region breakdown at all
 *     (brand/model/department aggregates only) — always withheld for
 *     region-scoped callers.
 *   - `deals`: if the feed is ever missing its `records` array (defensive —
 *     true today, but not guaranteed forever), the whole `deals` block is
 *     withheld rather than risk returning an org-wide aggregate unfiltered.
 */
export function applyRegionScope(data: any, scope: Scope): any {
  if (scope.full) return data;
  if (!data || typeof data !== 'object') return data;
  const allowed = new Set(scope.regions);

  const out: any = { ...data };

  // ---- Leads (direct region field) ----
  const leads: Lead[] = Array.isArray(data.leads)
    ? data.leads.filter((l: Lead) => !!l?.region && allowed.has(l.region))
    : [];
  out.leads = leads;

  // ---- leadsBySource / dropReasons: re-derived from the SAME filtered
  // leads (both fields live on every Lead row, so this is an exact
  // re-derivation, not an approximation). ----
  const bySourceLeads: Record<string, Lead[]> = {};
  const dropReasons: Record<string, number> = {};
  for (const l of leads) {
    const src = (l as any).source || 'Unknown';
    (bySourceLeads[src] = bySourceLeads[src] || []).push(l);
    const reason = (l as any).dropReason;
    if (reason) dropReasons[reason] = (dropReasons[reason] || 0) + 1;
  }
  const bySource: Record<string, { l: number; c: number; a: number; d: number }> = {};
  for (const [src, ls] of Object.entries(bySourceLeads)) {
    const r = calculateRates(ls);
    bySource[src] = { l: ls.length, c: r.contacted, a: r.active, d: r.dropped };
  }
  out.leadsBySource = bySource;
  out.dropReasons = dropReasons;

  if (Array.isArray(data.regions)) out.regions = data.regions.filter((r: string) => allowed.has(r));

  // ---- BD org directory ----
  const filteredOrg = filterOrg(data.org, allowed);
  out.org = filteredOrg;

  // ---- BDs map (data.bds, keyed by BD display name): keep only BDs whose
  // org-directory region is allowed. A name that can't be matched to an
  // allowed region is excluded (safe default, never included by accident). ----
  if (data.bds && typeof data.bds === 'object' && filteredOrg?.bds) {
    const allowedNames = new Set(Object.keys(filteredOrg.bds));
    out.bds = Object.fromEntries(Object.entries(data.bds as Record<string, unknown>).filter(([name]) => allowedNames.has(name)));
  } else {
    out.bds = {};
  }

  // ---- Deals: reuse the exact same records-recompute path the dashboard UI
  // itself uses for its region filter (computeDealsRuntime/aggregate), so a
  // scoped user's totals are guaranteed to match what the equivalent UI
  // filter would show — never a mix of "filtered list, unfiltered total". ----
  if (data.deals && Array.isArray(data.deals.records)) {
    const runtime = computeDealsRuntime(data.deals, regionFilters(scope.regions));
    const scopedDeals = runtime.deals ? { ...runtime.deals } : null;
    if (scopedDeals?.ranking && typeof scopedDeals.ranking === 'object') {
      // aggregate() doesn't touch `ranking` — it's a pass-through
      // presentation block, not part of the recomputed aggregate — so filter
      // it explicitly here.
      scopedDeals.ranking = {
        ...scopedDeals.ranking,
        bds: filterRankingArray(scopedDeals.ranking.bds, allowed),
        regionHeads: filterRankingArray(scopedDeals.ranking.regionHeads, allowed),
        regions: filterRankingArray(scopedDeals.ranking.regions, allowed),
      };
    }
    out.deals = scopedDeals;
  } else {
    // No per-deal records to safely re-filter from — withhold rather than
    // risk shipping another region's aggregate totals unfiltered.
    out.deals = null;
  }

  // ---- Proposals: no per-record region cut exists anywhere in this feed —
  // always withheld for region-scoped callers. ----
  out.proposals = null;

  return out;
}
