// Deals runtime — P0-2 (filter deals/revenue) + P0-4 (branch-aware funnel).
//
// deals.json historically carried ONLY aggregates, so the client could not
// re-filter the deal side when a global filter was active (the lead modules
// filtered, the deal modules silently did not). The pipeline now also emits a
// per-deal `records` array; this module recomputes every deal-side aggregate
// from those records under the active filters. When `records` is absent, or no
// deal-honourable filter is active, we return the feed's own aggregates
// unchanged so numbers never drift from the source of truth.

import { Filters } from './DashboardContext';

export interface DealRecord {
  id?: string | number;
  name?: string;
  brand?: string;
  stage?: string; // canonical stage label
  stageType?: 'open' | 'won' | 'dropped';
  maDate?: string | null; // signing date (won)
  expectedDate?: string | null; // expected LOI/MA date (open)
  signingDate?: string | null; // contracted date: MA_Date (MA) | LOI date (LOI Signed)
  keys?: number;
  feeContracted?: number;
  feeCollected?: number;
  feeCollectedActual?: number;
  feePending?: number;
  owner?: string;
  region?: string;
  state?: string;
  signingProbability?: string;
  propertyType?: string;
  landStatus?: string;
}

// Global filter dimensions the DEAL side can honour (records carry these fields).
const DEALS_HONOURED = ['brand', 'region', 'state', 'owner', 'from', 'to'] as const;
// Dimensions the deal records genuinely cannot express — a deal module must never
// look filtered by these; instead it renders an exemption badge.
const DEALS_EXEMPT: { key: keyof Filters; label: string }[] = [
  { key: 'status', label: 'lead-status' },
  { key: 'city', label: 'city' },
  { key: 'cluster', label: 'cluster' },
  { key: 'prop', label: 'property-type' },
];

const CLOSER_EXCLUDE = new Set(['super admin', 'sourav basu']);

const STAGE_BA = 'Business Approval Received';
const STAGE_UN = 'Under Negotiation';
const STAGE_LOI = 'LOI Signed';
const STAGE_MA = 'MA Signed';
const CANON_ORDER = [STAGE_BA, STAGE_UN, STAGE_LOI, STAGE_MA];

const PROB_LEVELS = ['High', 'Medium', 'Low'];

function normBrand(b?: string): string {
  const x = String(b || '').trim();
  return x || 'Unknown';
}

/** Which active filter dimensions the deal side cannot honour. */
export function dealsExemptDims(filters: Filters): string[] {
  return DEALS_EXEMPT.filter((d) => (filters[d.key] as Set<string>)?.size > 0).map((d) => d.label);
}

/** Is any deal-HONOURABLE filter active (brand/region/state/owner/date)? */
export function dealsHonouredActive(filters: Filters): boolean {
  if (filters.from || filters.to) return true;
  return DEALS_HONOURED.some((k) => k !== 'from' && k !== 'to' && (filters[k as keyof Filters] as Set<string>)?.size > 0);
}

/** Is ANY global filter active at all? */
export function anyFilterActive(filters: Filters): boolean {
  if (filters.from || filters.to) return true;
  return (Object.keys(filters) as (keyof Filters)[]).some(
    (k) => k !== 'from' && k !== 'to' && (filters[k] as Set<string>)?.size > 0
  );
}

/**
 * The date a deal record sits on for global date-range filtering.
 *
 * Must match the CONTRACTED-date rule the pipeline already uses, otherwise a
 * filtered view contradicts the unfiltered FY figures:
 *   Spark        -> LOI signing date (Expected_Actual_LOI_Date || Expected_LOI_Date
 *                   || MA_Date) — for Spark MAs too; precomputed as `signingDate`.
 *   Olive / Open -> MA_Date (no LOI stage), also precomputed as `signingDate`.
 * Signed (won) and LOI-signed records are therefore windowed by `signingDate`;
 * still-open and dropped records fall back to their expected date. Previously
 * this keyed off maDate/expectedDate, so a date-filtered contracted/collected
 * total disagreed with the same deals' unfiltered FY contribution.
 */
export function recordDate(rec: DealRecord): string | null {
  if (rec.stageType === 'won') return rec.signingDate || rec.maDate || null;
  if (rec.stage === STAGE_LOI) return rec.signingDate || rec.expectedDate || null;
  return rec.expectedDate || rec.signingDate || rec.maDate || null;
}

function passes(rec: DealRecord, filters: Filters): boolean {
  if (filters.brand.size && !filters.brand.has(normBrand(rec.brand))) return false;
  if (filters.region.size && !(rec.region && filters.region.has(rec.region))) return false;
  if (filters.state.size && !(rec.state && filters.state.has(rec.state))) return false;
  if (filters.owner.size && !(rec.owner && filters.owner.has(rec.owner))) return false;
  if (filters.from || filters.to) {
    const d = recordDate(rec);
    if (!d) return false; // undated deals cannot be placed on the timeline
    if (filters.from && d < filters.from) return false;
    if (filters.to && d > filters.to) return false;
  }
  return true;
}

interface FeeBlock {
  contracted: number;
  collected: number;
  collectedActual: number;
  pending: number;
}
const zeroFees = (): FeeBlock => ({ contracted: 0, collected: 0, collectedActual: 0, pending: 0 });
const r2 = (n: number) => Math.round(n * 100) / 100;

function periodBlock(wonRecs: DealRecord[], startISO: string | null, monthPrefix?: string) {
  const sig = { count: 0, byBrand: {} as Record<string, number>, byRegion: {} as Record<string, number> };
  const col = { amount: 0, byBrand: {} as Record<string, number>, byRegion: {} as Record<string, number> };
  for (const r of wonRecs) {
    const d = r.maDate;
    if (!d) continue;
    if (startISO && d < startISO) continue;
    if (monthPrefix && d.slice(0, 7) !== monthPrefix) continue;
    const brand = normBrand(r.brand);
    const region = r.region || 'Unspecified';
    const amt = Number(r.feeCollectedActual) || 0;
    sig.count += 1;
    sig.byBrand[brand] = (sig.byBrand[brand] || 0) + 1;
    sig.byRegion[region] = (sig.byRegion[region] || 0) + 1;
    col.amount += amt;
    col.byBrand[brand] = (col.byBrand[brand] || 0) + amt;
    col.byRegion[region] = (col.byRegion[region] || 0) + amt;
  }
  return {
    signings: { count: sig.count, byBrand: sig.byBrand, byRegion: sig.byRegion },
    collections: {
      amount: r2(col.amount),
      byBrand: Object.fromEntries(Object.entries(col.byBrand).map(([k, v]) => [k, r2(v)])),
      byRegion: Object.fromEntries(Object.entries(col.byRegion).map(([k, v]) => [k, r2(v)])),
      approx: true,
    },
  };
}

/** Recompute the full deals object from filtered records. */
function aggregate(filtered: DealRecord[], fallback: any) {
  const fyStart: string | null = fallback?.fees?.fy?.fyStart || fallback?.ytd?.fyStart || null;

  let signed = 0,
    active = 0,
    dropped = 0,
    keysAll = 0,
    keysFy = 0,
    fySigned = 0,
    fyContractedSignings = 0,
    undated = 0;
  const stageCounts: Record<string, number> = {};
  const dropCounts: Record<string, number> = {};
  const byBrand: Record<string, any> = {};
  const propType: Record<string, number> = {};
  const landStat: Record<string, number> = {};
  const closers: Record<string, { signed: number; feeContracted: number }> = {};
  const feesAll = zeroFees();
  const feesFy = zeroFees();
  const portfolio = { oliveMA: 0, sparkMA: 0, openMA: 0, sparkLOI: 0 };
  const prob: Record<string, { count: number; keys: number }> = {};
  [...PROB_LEVELS, 'Unspecified'].forEach((k) => (prob[k] = { count: 0, keys: 0 }));

  for (const r of filtered) {
    const brand = normBrand(r.brand);
    const keys = Number(r.keys) || 0;
    const ptype = String(r.propertyType || 'Unspecified').trim() || 'Unspecified';
    const lstat = String(r.landStatus || 'Unspecified').trim() || 'Unspecified';
    if (!byBrand[brand]) byBrand[brand] = { deals: 0, signed: 0, keys: 0, feeContracted: 0, feeCollected: 0, feePending: 0 };
    byBrand[brand].deals += 1;
    byBrand[brand].keys += keys;
    propType[ptype] = (propType[ptype] || 0) + 1;
    landStat[lstat] = (landStat[lstat] || 0) + 1;

    if (r.stageType === 'won') {
      signed += 1;
      keysAll += keys;
      stageCounts[STAGE_MA] = (stageCounts[STAGE_MA] || 0) + 1;
      byBrand[brand].signed += 1;
      const c = Number(r.feeContracted) || 0;
      const cl = Number(r.feeCollected) || 0;
      const ca = Number(r.feeCollectedActual) || 0;
      const pd = Number(r.feePending) || 0;
      feesAll.contracted += c;
      feesAll.collected += cl;
      feesAll.collectedActual += ca;
      feesAll.pending += pd;
      byBrand[brand].feeContracted += c;
      byBrand[brand].feeCollected += cl;
      byBrand[brand].feePending += pd;
      if (!r.maDate) undated += 1;
      else if (fyStart && r.maDate >= fyStart) {
        fySigned += 1;
        keysFy += keys;
        feesFy.collectedActual += ca;
        feesFy.pending += pd;
      }
      // FY contracted/collected follow the brand-specific CONTRACTED date
      // (signingDate: Spark by its LOI date incl. Spark MAs; Olive/Open by
      // MA date) so the filtered view mirrors the pipeline's fy block.
      const sdWon = r.signingDate || r.maDate || null;
      if (fyStart && sdWon && sdWon >= fyStart) {
        feesFy.contracted += c;
        feesFy.collected += cl;
        fyContractedSignings += 1;
      }
      if (brand === 'Olive') portfolio.oliveMA += 1;
      else if (brand === 'Spark') portfolio.sparkMA += 1;
      else if (brand === 'Open Hotels') portfolio.openMA += 1;
      const owner = String(r.owner || '').trim();
      if (owner && !CLOSER_EXCLUDE.has(owner.toLowerCase())) {
        if (!closers[owner]) closers[owner] = { signed: 0, feeContracted: 0 };
        closers[owner].signed += 1;
        closers[owner].feeContracted += c;
      }
    } else if (r.stageType === 'dropped') {
      dropped += 1;
      const label = r.stage || 'Dropped';
      dropCounts[label] = (dropCounts[label] || 0) + 1;
    } else {
      // open
      active += 1;
      const st = r.stage && CANON_ORDER.includes(r.stage) ? r.stage : STAGE_BA;
      stageCounts[st] = (stageCounts[st] || 0) + 1;
      if (r.stage === STAGE_LOI) {
        portfolio.sparkLOI += 1;
        // LOI Signed is a CONTRACTED milestone (Spark's signing event): its
        // Ta_Fee_Contracted joins the all-time contracted book + the by-brand
        // split, and the FY total when signed this FY (by the LOI signing date),
        // mirroring the pipeline so filtered contracted spans MA + LOI signed.
        const cLoi = Number(r.feeContracted) || 0;
        const clLoi = Number(r.feeCollected) || 0;
        feesAll.contracted += cLoi;
        feesAll.collected += clLoi; // headline Collected (TA_fee_collected) spans the same MA+LOI book
        byBrand[brand].feeContracted += cLoi;
        byBrand[brand].feeCollected += clLoi;
        const sd = r.signingDate || r.expectedDate || null;
        if (fyStart && sd && sd >= fyStart) {
          feesFy.contracted += cLoi;
          feesFy.collected += clLoi;
          fyContractedSignings += 1;
        }
      }
      const b = PROB_LEVELS.includes(String(r.signingProbability)) ? String(r.signingProbability) : 'Unspecified';
      prob[b].count += 1;
      prob[b].keys += keys;
    }
  }

  const total = signed + active + dropped;
  const rate = (x: number) => (total ? Math.round((x / total) * 1000) / 10 : 0);

  const funnel: Array<{ stage: string; count: number; type: string; note?: string }> = [];
  for (const st of CANON_ORDER) {
    const entry: any = { stage: st, count: stageCounts[st] || 0, type: st === STAGE_MA ? 'won' : 'open' };
    if (st === STAGE_LOI) entry.note = 'Spark Management only';
    funnel.push(entry);
  }
  Object.keys(dropCounts)
    .sort()
    .forEach((label) => funnel.push({ stage: label, count: dropCounts[label], type: 'dropped' }));

  const feeBlock = (f: FeeBlock) => ({
    contracted: r2(f.contracted),
    collected: r2(f.collected),
    collectedActual: r2(f.collectedActual),
    pending: r2(f.pending),
  });
  const feesFyBlock: any = feeBlock(feesFy);
  if (fyStart) feesFyBlock.fyStart = fyStart;
  feesFyBlock.deals = fySigned;
  feesFyBlock.signedDeals = fySigned;
  feesFyBlock.contractedSignings = fyContractedSignings;
  const feesAllBlock = feeBlock(feesAll);

  const byBrandRounded: Record<string, any> = {};
  for (const [b, v] of Object.entries<any>(byBrand)) {
    byBrandRounded[b] = {
      deals: v.deals,
      signed: v.signed,
      keys: v.keys,
      feeContracted: r2(v.feeContracted),
      feeCollected: r2(v.feeCollected),
      feePending: r2(v.feePending),
    };
  }

  const closerRows = Object.entries(closers)
    .map(([bd, v]) => ({ bd, signed: v.signed, feeContracted: r2(v.feeContracted) }))
    // Deterministic order: signed desc, then fee desc, then name asc (stable tiebreaker).
    .sort((a, b) => b.signed - a.signed || b.feeContracted - a.feeContracted || a.bd.localeCompare(b.bd));

  // Fiscal period recompute from filtered WON records (drift-free anchors from feed).
  const wonRecs = filtered.filter((r) => r.stageType === 'won');
  const mtdStart: string | null = fallback?.mtd?.start || null;
  const mtdPrefix: string | undefined = fallback?.mtd?.period || (mtdStart ? mtdStart.slice(0, 7) : undefined);
  const mtd = fallback?.mtd
    ? { ...fallback.mtd, ...periodBlock(wonRecs, mtdStart, mtdPrefix) }
    : fallback?.mtd;
  const ytd = fallback?.ytd
    ? { ...fallback.ytd, ...periodBlock(wonRecs, fyStart) }
    : fallback?.ytd;

  return {
    totals: {
      deals: total,
      signed,
      active,
      dropped,
      signRatePct: rate(signed),
      dropRatePct: rate(dropped),
      keysContracted: keysAll,
      keysContractedFY: keysFy,
    },
    funnel,
    fees: {
      contracted: feesAllBlock.contracted,
      collected: feesAllBlock.collected,
      pending: feesAllBlock.pending,
      collectedActual: feesAllBlock.collectedActual,
      allTime: feesAllBlock,
      fy: feesFyBlock,
      collectedBasis: fallback?.fees?.collectedBasis,
      undatedMASigned: undated,
    },
    byBrand: byBrandRounded,
    propertyType: propType,
    landStatus: landStat,
    signingProbability: prob,
    closers: closerRows,
    portfolio,
    mtd,
    ytd,
  };
}

function filterUpcoming(upcoming: any, filters: Filters): any {
  if (!Array.isArray(upcoming)) return upcoming;
  return upcoming.filter((u: any) => {
    if (filters.brand.size && !filters.brand.has(normBrand(u.brand))) return false;
    if (filters.region.size && !(u.region && filters.region.has(u.region))) return false;
    if (filters.owner.size && !(u.bd && filters.owner.has(u.bd))) return false;
    if (filters.from && u.expectedDate && u.expectedDate < filters.from) return false;
    if (filters.to && u.expectedDate && u.expectedDate > filters.to) return false;
    return true;
  });
}

export interface DealsRuntime {
  deals: any | null;
  recomputed: boolean; // true when we recomputed from records under an active filter
  exemptDims: string[]; // active filter dims the deal side cannot honour
  filterActive: boolean; // any deal-relevant OR exempt filter active
  dateCaption: string; // explains which date the range filtered on
}

export function computeDealsRuntime(deals: any, filters: Filters): DealsRuntime {
  const exemptDims = dealsExemptDims(filters);
  const honoured = dealsHonouredActive(filters);
  const filterActive = honoured || exemptDims.length > 0;
  const dateCaption =
    filters.from || filters.to
      ? 'Date range filters contracted deals by their signing date (Spark by its LOI date, Olive/Open Hotels by MA date) and still-open deals by expected date; undated deals are excluded while a date filter is active.'
      : '';

  if (!deals) return { deals: null, recomputed: false, exemptDims, filterActive: false, dateCaption };

  const records: DealRecord[] | null = Array.isArray(deals.records) ? deals.records : null;

  // No records to re-filter, or no honourable filter → keep the feed aggregates
  // unchanged (so unfiltered numbers exactly match the source of truth).
  if (!records || !honoured) {
    return { deals, recomputed: false, exemptDims, filterActive, dateCaption };
  }

  const filtered = records.filter((r) => passes(r, filters));
  const recomputedAgg = aggregate(filtered, deals);
  const merged = {
    ...deals,
    ...recomputedAgg,
    upcoming: filterUpcoming(deals.upcoming, filters),
    _recomputed: true,
    _recordsFiltered: filtered.length,
    _filteredRecords: filtered,
  };
  return { deals: merged, recomputed: true, exemptDims, filterActive, dateCaption };
}

// ---------------------------------------------------------------------------
// P0-4 — Branch-aware funnel model. The previous renderer computed each row's %
// against the PREVIOUS LIST row, so LOI (a Spark-only side branch of 24) became
// MA Signed's denominator → "MA Signed 595.8%", and drop categories were treated
// as sequential stages ("Dropped After Operational 700%"). We model the funnel
// as a branch-aware graph instead:
//   Business Approval Received → Under Negotiation → MA Signed  (main path)
//   LOI Signed  = Spark-only SIDE node off Under Negotiation (excluded from the
//                 main denominator chain; it merges back into MA).
//   MA Signed % = MA / (Under Negotiation + LOI)  — the cohort that feeds signings.
//   Drop stages = EXITS, shown as "x% of exits", never a forward conversion.
// A hard cap guarantees no conversion figure can ever exceed 100%.
export interface FunnelRow {
  stage: string;
  count: number;
  type: string;
  note?: string;
}
export interface FunnelModelRow extends FunnelRow {
  kind: 'main' | 'side' | 'drop';
  convPct?: number; // ≤100, share of true parent cohort (main + side)
  parentLabel?: string; // human label of the cohort convPct is against
  exitPct?: number; // drop share of total exits
  barPct: number; // bar width vs the largest main-path count
}

export interface FunnelModel {
  rows: FunnelModelRow[];
  maCohortLabel: string; // caption: which cohort MA Signed % is computed against
}

const HARD_CAP = 100;

export function buildFunnelModel(funnel: FunnelRow[]): FunnelModel {
  const byStage = new Map(funnel.map((f) => [f.stage, f]));
  const count = (s: string) => byStage.get(s)?.count ?? 0;
  const mainCounts = [STAGE_BA, STAGE_UN, STAGE_MA].map(count);
  const maxMain = Math.max(1, ...mainCounts, count(STAGE_LOI));

  // Enforce the hard cap in ONE place. Assert (dev) then clamp so a broken
  // upstream count can never render a >100% conversion.
  const conv = (numer: number, denom: number): number | undefined => {
    if (!(denom > 0)) return undefined;
    const p = (numer / denom) * 100;
    if (p > HARD_CAP + 0.05) {
      if (typeof console !== 'undefined' && process.env.NODE_ENV !== 'production') {
        console.error(`[funnel] conversion ${p.toFixed(1)}% exceeds 100% (numer=${numer}, denom=${denom}) — clamped.`);
      }
      return HARD_CAP;
    }
    return p;
  };

  const rows: FunnelModelRow[] = [];
  const bar = (c: number) => (c / maxMain) * 100;

  if (byStage.has(STAGE_BA)) {
    const f = byStage.get(STAGE_BA)!;
    rows.push({ ...f, kind: 'main', barPct: bar(f.count) });
  }
  if (byStage.has(STAGE_UN)) {
    const f = byStage.get(STAGE_UN)!;
    rows.push({ ...f, kind: 'main', convPct: conv(f.count, count(STAGE_BA)), parentLabel: STAGE_BA, barPct: bar(f.count) });
  }
  if (byStage.has(STAGE_LOI)) {
    const f = byStage.get(STAGE_LOI)!;
    rows.push({
      ...f,
      kind: 'side',
      convPct: conv(f.count, count(STAGE_UN)),
      parentLabel: `${STAGE_UN} (Spark side branch)`,
      barPct: bar(f.count),
    });
  }
  if (byStage.has(STAGE_MA)) {
    const f = byStage.get(STAGE_MA)!;
    const cohort = count(STAGE_UN) + count(STAGE_LOI);
    rows.push({
      ...f,
      kind: 'main',
      convPct: conv(f.count, cohort),
      parentLabel: `${STAGE_UN} + ${STAGE_LOI}`,
      barPct: bar(f.count),
    });
  }

  const drops = funnel.filter((f) => f.type === 'dropped');
  const totalExits = drops.reduce((a, d) => a + d.count, 0);
  drops.forEach((d) =>
    rows.push({
      ...d,
      kind: 'drop',
      exitPct: totalExits > 0 ? (d.count / totalExits) * 100 : undefined,
      barPct: bar(d.count),
    })
  );

  return { rows, maCohortLabel: `${STAGE_UN} + ${STAGE_LOI} (Spark) cohort` };
}
