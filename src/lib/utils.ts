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

export const CONT_STATUSES = new Set(['Lead Contacted', 'Under Discussion', 'Awaiting Business Approval']);
export const ACT_STATUSES = new Set(['Under Discussion', 'Awaiting Business Approval']);

import { Lead, Rates, BD, LeaderboardRec } from './types';

export function calculateRates(ls: Lead[]): Rates {
  const assigned = ls.filter(l => !!l.owner);
  const n = assigned.length;
  let c = 0, act = 0, d = 0;
  
  assigned.forEach(l => {
    if (l.status && CONT_STATUSES.has(l.status)) c++;
    if (l.status && ACT_STATUSES.has(l.status)) act++;
    if (l.status === 'Lead Dropped') d++;
  });
  
  return {
    n,
    contacted: c,
    active: act,
    dropped: d,
    contact: n ? (c / n) * 100 : 0,
    activeR: n ? (act / n) * 100 : 0,
    drop: n ? (d / n) * 100 : 0,
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
