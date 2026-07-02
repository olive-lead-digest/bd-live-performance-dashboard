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
 * Normalize a brand value to a stable short key. The real data uses the full
 * string "Open Hotels" (not "Open"), which previously broke brand matching and
 * left the Open line/series empty. Maps: "Open Hotels" -> "open", "Olive" ->
 * "olive", "Spark" -> "spark".
 */
export const brandKey = (b?: string | null): string => {
  const x = (b || '').toLowerCase().trim();
  return x.startsWith('open') ? 'open' : x;
};

import { Lead, Rates, BD, LeaderboardRec } from './types';

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

export function buildLeaderboard(fl: Lead[], bds: Record<string, BD>, weights: {Q: number, Cv: number, Cmp: number, Lv: number, Cav: number}): LeaderboardRec[] {
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
      band: ''
    };
  });

  const Lv = pctile(recs.map(r => r.n));
  const Cav = pctile(recs.map(r => r.conn));

  recs.forEach((r, i) => {
    if (r.reviewed && r.q) {
      const Q = r.q.overall * 10;
      const Cmp = r.q.brand_alignment * 10;
      const Cv = clamp(50 + r.active * 2.2 + (r.contact - 40) * 0.25 - Math.max(0, r.drop - 10) * 1.1);

      const sc = weights.Q * Q + weights.Cv * Cv + weights.Cmp * Cmp + weights.Lv * Lv[i] + weights.Cav * Cav[i];

      r.bps = { Q, Cv, Cmp, Lv: Lv[i], Cav: Cav[i], score: sc };
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
