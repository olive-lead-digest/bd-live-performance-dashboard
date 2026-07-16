'use client';

import { useMemo, useState } from 'react';
import { useDashboard } from '@/lib/DashboardContext';
import { ClipboardCheck, CheckCircle2, XCircle, Clock } from 'lucide-react';

const num = (n: number) => Math.round(n).toLocaleString('en-IN');
const pct = (n?: number | null) => (n == null ? '—' : `${n.toFixed(0)}%`);

/*
 * Proposals / department-approval stage — the pre-deal, under-approval entity
 * that sits between Leads and Deals in the BD funnel:
 *   Leads -> PROPOSALS (dept approvals) -> Deals -> Signings
 *
 * Source: Zoho "Awaiting_BusinessApproval" (Proposals) module, published as
 * data.proposals by the hourly refresh job. A proposal needs Sales/Revenue,
 * Design and/or Ops approvals depending on brand & model; once the required
 * approvals land a Deal auto-creates at "Business Approval Received".
 *
 * Renders null when the feed carries no proposals (always guarded).
 */

const STATE_CARDS: { key: 'approved' | 'rejected' | 'pending'; label: string; color: string; bg: string; icon: typeof CheckCircle2 }[] = [
  { key: 'approved', label: 'Approved', color: '#34d399', bg: 'rgba(52,211,153,0.12)', icon: CheckCircle2 },
  { key: 'pending', label: 'Under Approval', color: '#ffb020', bg: 'rgba(255,176,32,0.12)', icon: Clock },
  { key: 'rejected', label: 'Rejected', color: '#ef4444', bg: 'rgba(239,68,68,0.12)', icon: XCircle },
];

const DEPTS: { key: 'salesRevenue' | 'design' | 'ops'; label: string }[] = [
  { key: 'salesRevenue', label: 'Sales / Revenue' },
  { key: 'design', label: 'Design' },
  { key: 'ops', label: 'Ops' },
];

export function ProposalsStageCard() {
  const { data } = useDashboard();
  const p = data?.proposals;
  const [arrBrand, setArrBrand] = useState<string>('');

  const stateRows = useMemo(() => {
    const t = p?.totals;
    if (!t) return [];
    return STATE_CARDS.map((c) => ({ ...c, count: Number(t[c.key]) || 0 }));
  }, [p]);

  if (!p || !p.totals || (p.totals.proposals ?? 0) === 0) return null;

  const t = p.totals;
  const total = t.proposals || 0;
  const dept = p.byDeptApproval || ({} as NonNullable<typeof p.byDeptApproval>);
  // ARR / occupancy split by brand (analyst correction) — one average per brand
  // is meaningful; a single overall average is not. Falls back to the overall
  // block if the feed carries no per-brand split.
  const arrBrands = Object.keys(p.arrOccupancyByBrand || {});
  const activeArrBrand = arrBrand && arrBrands.includes(arrBrand) ? arrBrand : (arrBrands[0] || '');
  const arr = (p.arrOccupancyByBrand && activeArrBrand && p.arrOccupancyByBrand[activeArrBrand]) || p.arrOccupancy;

  return (
    <div className="glass-panel p-4 sm:p-6 flex flex-col relative z-10">
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <h2 className="text-xs font-bold uppercase tracking-widest text-white flex items-center gap-2">
          <ClipboardCheck className="w-4 h-4 text-brand-pink-400" /> Proposals &amp; Approvals
        </h2>
        <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary bg-surface px-2 py-1 rounded">
          {num(total)} proposals · {pct(t.approvalRatePct)} approval rate
        </span>
      </div>

      {/* Approval-state distribution bar */}
      <div className="h-4 rounded-full bg-surface overflow-hidden flex shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] mb-5">
        {stateRows.map((r) => {
          const w = total > 0 ? (r.count / total) * 100 : 0;
          if (w <= 0) return null;
          return (
            <div
              key={r.key}
              className="h-full border-r border-black/40 last:border-0"
              style={{ width: `${w}%`, backgroundColor: r.color }}
              title={`${r.label}: ${num(r.count)}`}
            />
          );
        })}
      </div>

      {/* State cards */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {stateRows.map((r) => {
          const share = total > 0 ? (r.count / total) * 100 : 0;
          const Icon = r.icon;
          return (
            <div
              key={r.key}
              className="rounded-xl p-4 border border-border-subtle/60 flex flex-col gap-2"
              style={{ backgroundColor: r.bg }}
            >
              <div className="flex items-center gap-2">
                <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: r.color }} />
                <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary truncate">{r.label}</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black tabular-nums" style={{ color: r.color }}>{num(r.count)}</span>
                <span className="text-xs font-bold text-text-secondary">{share.toFixed(0)}%</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Department-level approval status — approved OF REQUIRED (a proposal only
          needs a department's approval when that department is required for it). */}
      <div className="mb-6">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-secondary mb-3">Department approvals (of required)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {DEPTS.map((d) => {
            const v = dept[d.key];
            if (!v) return null;
            const required = Number(v.required) || 0;
            if (required === 0) return null; // dept not required for any of these brands/models
            const approved = Number(v.approved) || 0;
            const approvedPct = required > 0 ? (approved / required) * 100 : 0;
            return (
              <div key={d.key} className="rounded-xl p-3 border border-border-subtle/60 bg-surface/40 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-white">{d.label}</span>
                  <span className="text-[10px] font-bold text-emerald-400 tabular-nums">{approvedPct.toFixed(0)}%</span>
                </div>
                <div className="text-xs text-white font-bold">
                  {num(approved)} <span className="text-text-secondary font-medium">of {num(required)} required approved</span>
                </div>
                <div className="h-1.5 w-full bg-surface rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.min(100, approvedPct)}%` }} />
                </div>
                <div className="flex flex-col gap-1 text-[11px]">
                  <Row label="Approved" value={v.approved} color="#34d399" />
                  <Row label="Pending" value={v.pending} color="#ffb020" />
                  <Row label="Rejected" value={v.rejected} color="#ef4444" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* By brand & by model (analyst correction — these were not visible before) */}
      <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ByGroup title="By brand" data={p.byBrand} />
        <ByGroup title="By model" data={p.byModel} />
      </div>

      {/* ARR & Occupancy averages (Sales/Revenue-set targets) — split BY BRAND */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-secondary">
            Revenue targets (averages across proposals)
          </h3>
          {arrBrands.length > 0 && (
            <div className="flex bg-black/40 p-1 rounded-lg border border-border-subtle/50">
              {arrBrands.map((b) => (
                <button
                  key={b}
                  onClick={() => setArrBrand(b)}
                  className={
                    'px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ' +
                    (activeArrBrand === b ? 'bg-brand-pink-500 text-white shadow-[0_0_10px_rgba(218,26,132,0.4)]' : 'text-text-secondary hover:text-white')
                  }
                >
                  {b}
                </button>
              ))}
            </div>
          )}
        </div>
        <p className="text-[10px] text-text-secondary italic mb-3">
          ARR = Average Room Rate (₹ per room-night) — not Annual Recurring Revenue.
          {arrBrands.length ? ` Showing ${activeArrBrand}.` : ''}
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <Metric label="Year 1 ARR" value={arr.year1Arr} kind="arr" />
          <Metric label="Year 1 Occupancy" value={arr.year1Occ} kind="occ" />
          <Metric label="Stabilised ARR" value={arr.stabilisedArr} kind="arr" />
          <Metric label="Stabilised Occupancy" value={arr.stabilisedOcc} kind="occ" />
          <Metric label="Landlord-expected ARR" value={arr.landlordArr} kind="arr" />
          <Metric label="Landlord-expected Occupancy" value={arr.landlordOcc} kind="occ" />
        </div>
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-text-secondary">
        Proposals are the pre-deal, under-approval stage from Zoho. Once the required department
        approvals land, a deal auto-creates at &ldquo;Business Approval Received&rdquo;.
      </p>
    </div>
  );
}

function ByGroup({
  title,
  data,
}: {
  title: string;
  data?: Record<string, { proposals: number; approved: number; rejected: number; pending: number }>;
}) {
  const rows = Object.entries(data || {})
    .map(([name, v]) => ({ name, ...v }))
    .filter((r) => (Number(r.proposals) || 0) > 0)
    .sort((a, b) => (Number(b.proposals) || 0) - (Number(a.proposals) || 0));
  if (rows.length === 0) return null;
  return (
    <div>
      <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-secondary mb-3">{title}</h3>
      <div className="flex flex-col gap-2">
        {rows.map((r) => {
          const appr = r.proposals > 0 ? (Number(r.approved) / r.proposals) * 100 : 0;
          return (
            <div key={r.name} className="rounded-lg p-2.5 border border-border-subtle/60 bg-surface/40">
              <div className="flex items-center justify-between text-[11px] mb-1 gap-2">
                <span className="text-white font-bold truncate">{r.name}</span>
                <span className="text-text-secondary whitespace-nowrap">
                  {num(r.proposals)} proposals · <span className="text-emerald-400 font-bold">{appr.toFixed(0)}%</span> appr.
                </span>
              </div>
              <div className="h-1.5 w-full bg-surface rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.min(100, appr)}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Row({ label, value, color }: { label: string; value?: number; color: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 text-text-secondary">
        <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: color }} />
        {label}
      </span>
      <span className="text-white font-bold tabular-nums">{num(Number(value) || 0)}</span>
    </div>
  );
}

function Metric({
  label,
  value,
  kind,
}: {
  label: string;
  value?: { avg: number | null; n: number };
  kind: 'arr' | 'occ';
}) {
  const avg = value?.avg ?? null;
  const n = value?.n ?? 0;
  const display =
    avg == null ? '—' : kind === 'occ' ? `${avg.toFixed(1)}%` : `₹${num(avg)}`;
  return (
    <div className="rounded-xl p-4 border border-border-subtle/60 bg-surface/40 flex flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary truncate">{label}</span>
      <span className="text-xl font-black tabular-nums text-white">{display}</span>
      {n > 0 && <span className="text-[10px] text-text-secondary tabular-nums">n = {num(n)}</span>}
    </div>
  );
}
