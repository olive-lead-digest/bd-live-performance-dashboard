export const clamp = (val: number, min = 0, max = 100) => Math.max(min, Math.min(max, val));

export function wilson(k: number, n: number): [number, number] {
  if (!n) return [0, 0];
  const z = 1.96;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, (c - h) * 100), Math.min(100, (c + h) * 100)];
}

export function pctile(vals: number[]): number[] {
  const idx = vals.map((_, i) => i).sort((a, b) => vals[a] - vals[b]);
  const pr = new Array(vals.length).fill(0);
  idx.forEach((i, r) => {
    pr[i] = vals.length > 1 ? Math.round((r / (vals.length - 1)) * 100) : 50;
  });
  return pr;
}

/*
 * Status taxonomy — the 4 OFFICIAL lead statuses are:
 *   New Leads, Lead Contacted, Under Discussion, Lead Dropped.
 * ("Awaiting Business Approval" is NOT an official lead status — it lives in the
 * Deals module, not the lead pipeline — so it has been removed from every set.)
 *
 * CONT_STATUSES  = a lead that has been engaged at least once (past "New Leads")
 *                  = { Lead Contacted, Under Discussion }.
 * ACT_STATUSES   = a lead in an active, live conversation right now
 *                  = { Under Discussion } only.
 * WON_STATUSES   = closed-won. The current Leads-by-phone pipeline carries almost
 *                  no won status (won deals live in the CRM Deals module), so this
 *                  is near-empty today but kept forward-compatible: if the pipeline
 *                  later surfaces Closure/Won/Signed, win-rate starts working with
 *                  no further code change.
 */
export const CONT_STATUSES = new Set(['Lead Contacted', 'Under Discussion']);
export const ACT_STATUSES = new Set(['Under Discussion']);
export const WON_STATUSES = new Set(['Closure', 'Won', 'Signed', 'Qualified (WON)']);
export const DROP_STATUSES = new Set(['Lead Dropped', 'Lost Lead', 'Junk Lead', 'Not Qualified']);

export const isContacted = (s: string | null) => !!s && CONT_STATUSES.has(s);
export const isActive = (s: string | null) => !!s && ACT_STATUSES.has(s);
export const isWon = (s: string | null) => !!s && WON_STATUSES.has(s);
export const isDropped = (s: string | null) => !!s && DROP_STATUSES.has(s);

/*
 * Estimated value per lead/deal. The lead pipeline has no per-record monetary
 * amount (those live in the CRM Deals module), so every "$" figure in the UI is
 * an ILLUSTRATIVE estimate = count x ESTIMATED_DEAL_VALUE. Centralized here so it
 * can be changed in one place or replaced with a real Deals-join later.
 */
export const ESTIMATED_DEAL_VALUE = 12500;

/*
 * P0-3 — deterministic estimated value.
 * The Geography est.-value figures were unstable across reloads. There is no
 * Math.random in the maths; the movement came from (a) the leads dataset
 * changing mid-audit and (b) count-based estimates with no fixed per-record
 * basis. To make every estimate a pure, reproducible function of the (now
 * stable) dataset, estimated value is derived from FIXED per-tier average-fee
 * constants defined here in ONE place — never a live/seeded computation.
 * Unknown/blank tiers fall back to ESTIMATED_DEAL_VALUE.
 */
export const TIER_AVG_FEE: Record<string, number> = {
  'Tier 1': 20000,
  'Tier 2': 12500,
  'Tier 3': 7500,
};

export const leadEstValue = (l: { tier?: string | null }): number =>
  TIER_AVG_FEE[(l.tier || '').trim()] ?? ESTIMATED_DEAL_VALUE;

/** Sum of fixed per-tier estimated value over a set of leads (deterministic). */
export const estValue = (leads: { tier?: string | null }[]): number => {
  let s = 0;
  for (const l of leads) s += leadEstValue(l);
  return s;
};

/*
 * Normalize a brand value to a stable short key. The real data uses the full
 * string "Open Hotels" (not "Open"), which previously broke brand matching and
 * left the Open line/series empty. Maps: "Open Hotels" -> "open", "Olive" ->
 * "olive", "Spark" -> "spark".
 */
export const brandKey = (b?: string | null): string => {
  const x = (b || '').toLowerCase().trim();
  return x.startsWith('open') ? 'open' : x;
};

import { Lead, Rates, BD, LeaderboardRec, OrgMap } from './types';

/*
 * P1-8 — ONE roster source of truth + ONE QA-coverage computation.
 *
 * bd_org.json (published as data.org) is the roster of record: 27 BDs. Its keys
 * use display spellings that differ from the CRM `owner` field / data.bds keys,
 * so we join on each entry's `zohoName`. Anyone who appears in the leads/deals
 * data but is NOT in this roster (e.g. the ex-BD "Venkatashiva K V", or test
 * accounts) is tagged `inactive` and excluded from band counts & percentages —
 * never silently deleted.
 */
export function rosterOwnerSet(org?: OrgMap | null): Set<string> {
  const bds = org?.bds || {};
  const s = new Set<string>();
  for (const k of Object.keys(bds)) s.add(String(bds[k]?.zohoName || k).trim());
  return s;
}

export interface QaCoverage {
  total: number;
  reviewed: number;
  missing: number;
  missingNames: string[];
}

/** Single QA-coverage figure over the roster, so Overview, Leaderboard and
 *  Reporting all report the SAME "reps with / without an AI review" count. */
export function qaCoverage(data?: { org?: OrgMap; bds?: Record<string, BD> } | null): QaCoverage {
  const roster = [...rosterOwnerSet(data?.org)];
  const bds = data?.bds || {};
  const missingNames = roster.filter((n) => !(bds[n] && bds[n].q));
  return {
    total: roster.length,
    reviewed: roster.length - missingNames.length,
    missing: missingNames.length,
    missingNames,
  };
}

export function calculateRates(ls: Lead[]): Rates {
  const assigned = ls.filter(l => !!l.owner);
  const n = assigned.length;
  let c = 0, act = 0, d = 0, w = 0;

  assigned.forEach(l => {
    if (isContacted(l.status)) c++;
    if (isActive(l.status)) act++;
    if (isWon(l.status)) w++;
    if (isDropped(l.status)) d++;
  });

  return {
    n,
    contacted: c,
    active: act,
    dropped: d,
    won: w,
    contact: n ? (c / n) * 100 : 0,
    activeR: n ? (act / n) * 100 : 0,
    drop: n ? (d / n) * 100 : 0,
    wonR: n ? (w / n) * 100 : 0,
    contactCI: wilson(c, n),
    activeCI: wilson(act, n),
    dropCI: wilson(d, n)
  };
}

/*
 * Per-BD signings map (MA-Signed + LOI-Signed) from the deals feed's per-deal
 * records. Deterministic. Signings are the org's primary KPI, so they are folded
 * into the balanced score and surfaced as a figure on the performance cards.
 * House / excluded accounts are dropped to match the deals closers list.
 */
export function signingsByOwner(deals?: { records?: any[] } | null): Record<string, number> {
  const out: Record<string, number> = {};
  const recs: any[] = Array.isArray(deals?.records) ? (deals!.records as any[]) : [];
  const EXCLUDE = new Set(['super admin', 'sourav basu']);
  for (const r of recs) {
    const owner = String(r?.owner || '').trim();
    if (!owner || EXCLUDE.has(owner.toLowerCase())) continue;
    const isMA = r?.stageType === 'won';
    const isLOI = r?.stage === 'LOI Signed';
    if (isMA || isLOI) out[owner] = (out[owner] || 0) + 1;
  }
  return out;
}

export function buildLeaderboard(fl: Lead[], bds: Record<string, BD>, weights: {Q: number, Cv: number, Cmp: number, Lv: number, Cav: number}, roster?: Set<string>, signingsMap?: Record<string, number>): LeaderboardRec[] {
  const byo: Record<string, Lead[]> = {};
  fl.forEach(l => {
    if (l.owner) {
      if (!byo[l.owner]) byo[l.owner] = [];
      byo[l.owner].push(l);
    }
  });

  const recs: LeaderboardRec[] = Object.keys(byo).map(owner => {
    const ls = byo[owner];
    const rt = calculateRates(ls);
    const bd = bds[owner] || {};
    return {
      owner,
      n: rt.n,
      contact: rt.contact,
      active: rt.activeR,
      drop: rt.drop,
      activeCI: rt.activeCI,
      dropCI: rt.dropCI,
      contactCI: rt.contactCI,
      reviewed: !!(bd.q),
      q: bd.q,
      low: bd.low,
      zoom: bd.zoom || { out: 0, conn: 0, rec: 0, avg: 0, connect_rate: 0 },
      cum: bd.cum,
      bd,
      conn: (bd.zoom && bd.zoom.conn) || 0,
      bps: null,
      band: '',
      // Signings (MA + LOI) for this BD — undefined when no map supplied so
      // callers that don't pass one keep the prior behaviour unchanged.
      signings: signingsMap ? (signingsMap[owner] || 0) : undefined,
      // P1-8: not in the org roster (ex-BD / test account) → excluded from
      // band counts & QA percentages by consumers, but kept (never deleted).
      inactive: roster ? !roster.has(owner) : false
    };
  });

  const Lv = pctile(recs.map(r => r.n));
  const Cav = pctile(recs.map(r => r.conn));

  recs.forEach((r, i) => {
    // Signings fold into the balanced score as an ADDITIVE bonus (it never lowers
    // an existing score, so the band thresholds stay meaningful): +5 pts per
    // signing, capped at +20. Sg is the 0-100 sub-score kept for the profile bars.
    const sg = r.signings || 0;
    const sgBonus = clamp(sg * 5, 0, 20);
    const Sg = clamp(sg * 20, 0, 100);
    if (r.reviewed && r.q) {
      const Q = r.q.overall * 10;
      const Cmp = r.q.brand_alignment * 10;
      const Cv = clamp(50 + r.active * 2.2 + (r.contact - 40) * 0.25 - Math.max(0, r.drop - 10) * 1.1);

      const base = weights.Q * Q + weights.Cv * Cv + weights.Cmp * Cmp + weights.Lv * Lv[i] + weights.Cav * Cav[i];
      const sc = Math.min(100, base + sgBonus);

      r.bps = { Q, Cv, Cmp, Lv: Lv[i], Cav: Cav[i], Sg, score: sc };
      r.band = sc >= 72 ? 'Top performer' : sc >= 63 ? 'Strong' : sc >= 54 ? 'Developing' : 'Priority coaching';
    } else {
      r.bps = null;
      r.band = 'Pending review';
    }
  });

  return recs;
}

export function groupCounts<T>(items: T[], field: keyof T): Record<string, number> {
  const m: Record<string, number> = {};
  items.forEach(item => {
    const val = item[field] as unknown as string;
    const k = val || '(none)';
    m[k] = (m[k] || 0) + 1;
  });
  return m;
}
