'use client';

import { useMemo } from 'react';
import { useDashboard } from '@/lib/DashboardContext';
import { Trophy, Map, Users } from 'lucide-react';
import { num } from '@/lib/format';
import { NotAffectedBadge } from '@/components/DataBadges';
import { MobileStatCard, InfoNote } from '@/components/MobileStatCard';

interface BDRank {
  bd?: string;
  region?: string;
  regionHead?: string;
  ytdTarget?: number;
  ytdAchievement?: number;
  achievementPct?: number;
  rank?: number;
}
interface RegionRank {
  region?: string;
  regionHead?: string;
  bds?: number;
  ytdTarget?: number;
  ytdAchievement?: number;
  achievementPct?: number;
  rank?: number;
}

function pctColor(p?: number) {
  if (p == null) return '#9896a3';
  if (p >= 75) return '#34d399';
  if (p >= 40) return '#ffb020';
  return '#ef4444';
}

const pctText = (p?: number) => (p == null ? '—' : `${p.toFixed(1)}%`);

function PctBar({ p }: { p?: number }) {
  const v = Math.max(0, Math.min(100, p ?? 0));
  return (
    <div className="flex items-center gap-2 justify-end">
      <div className="w-16 h-1.5 rounded-full bg-surface overflow-hidden hidden md:block">
        <div className="h-full rounded-full" style={{ width: `${v}%`, backgroundColor: pctColor(p) }} />
      </div>
      <span className="font-bold tabular-nums" style={{ color: pctColor(p) }}>
        {p == null ? '—' : `${p.toFixed(1)}%`}
      </span>
    </div>
  );
}

// Small rank chip reused by every mobile card so the ranking stays legible.
function RankChip({ n }: { n: React.ReactNode }) {
  return (
    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-surface text-text-secondary text-xs font-bold tabular-nums shrink-0">
      {n}
    </span>
  );
}

export function BDRankingTables() {
  const { data, filters } = useDashboard();
  const ranking = data?.deals?.ranking;

  // The ranking rows are published per BD / per region against FISCAL-YEAR
  // targets. Region and BD(owner) filters can be honoured honestly by selecting
  // rows. A DATE range cannot: "achievement vs FY target" is not a windowed
  // quantity, and prorating the target would fabricate a number. Same for brand
  // (points are published aggregated across brands) and the lead-only dims.
  // Those are surfaced with an exemption badge instead of silently ignoring.
  const rowFilterDims = useMemo(() => {
    const dims: string[] = [];
    if (filters.from || filters.to) dims.push('date');
    if (filters.brand.size) dims.push('brand');
    if (filters.state.size) dims.push('state');
    if (filters.city.size) dims.push('city');
    if (filters.cluster.size) dims.push('cluster');
    if (filters.status.size) dims.push('lead-status');
    if (filters.prop.size) dims.push('property-type');
    return dims;
  }, [filters]);

  const keepBd = useMemo(() => {
    const reg = filters.region, own = filters.owner;
    return (r: BDRank) =>
      (!reg.size || !!(r.region && reg.has(r.region))) &&
      (!own.size || !!(r.bd && own.has(r.bd)));
  }, [filters.region, filters.owner]);

  const keepRegion = useMemo(() => {
    const reg = filters.region;
    return (r: RegionRank) => !reg.size || !!(r.region && reg.has(r.region));
  }, [filters.region]);

  const bds = useMemo<BDRank[]>(() => {
    const list = ranking?.bds;
    if (!Array.isArray(list)) return [];
    return [...list].filter(keepBd).sort((a: BDRank, b: BDRank) => (a.rank ?? 999) - (b.rank ?? 999));
  }, [ranking, keepBd]);

  const regions = useMemo<RegionRank[]>(() => {
    const list = ranking?.regions;
    if (!Array.isArray(list)) return [];
    return [...list].filter(keepRegion).sort((a: RegionRank, b: RegionRank) => (a.rank ?? 999) - (b.rank ?? 999));
  }, [ranking, keepRegion]);

  // Region heads — listed separately, no individual BD rank (they are excluded
  // from the BD ranking). Deterministic order: achievement desc, then name.
  const regionHeads = useMemo<BDRank[]>(() => {
    const list = ranking?.regionHeads;
    if (!Array.isArray(list)) return [];
    return [...list].filter(keepBd).sort(
      (a: BDRank, b: BDRank) => (b.achievementPct ?? 0) - (a.achievementPct ?? 0) || String(a.bd).localeCompare(String(b.bd))
    );
  }, [ranking, keepBd]);

  if (!ranking || (bds.length === 0 && regions.length === 0 && regionHeads.length === 0)) return null;

  const rule =
    ranking?.meta?.pointRules ||
    'Olive MA = 1, Open MA = 0.5, Spark counted at LOI = 1 (Spark MA not counted). Target = 1 point / BD / month.';

  return (
    <div className="flex flex-col gap-4 sm:gap-6 relative z-10">
      {/* BD-wise ranking */}
      {bds.length > 0 && (
        <div className="glass-panel p-4 sm:p-6">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h2 className="text-xs font-bold uppercase tracking-widest text-white flex items-center gap-2">
              <Trophy className="w-4 h-4 text-brand-pink-400" /> BD Ranking (points-based)
            </h2>
            <NotAffectedBadge
              dims={rowFilterDims}
              title="BD Ranking measures fiscal-year-to-date points against fiscal-year targets, so it cannot be windowed to a date range or split by brand. Region and BD filters ARE applied."
            />
          </div>
          <InfoNote
            desktopClassName="text-[11px] text-text-secondary mb-4 leading-relaxed"
            mobileLabel="How ranking is scored"
            title="Ranking methodology"
          >
            {rule}
          </InfoNote>

          {/* Desktop table (unchanged >= md) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm min-w-[680px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-widest text-text-secondary border-b border-border-subtle">
                  <th className="text-left py-2 pr-3 font-bold">Rank</th>
                  <th className="text-left py-2 px-3 font-bold">Region</th>
                  <th className="text-left py-2 px-3 font-bold">Region Head</th>
                  <th className="text-left py-2 px-3 font-bold">BD</th>
                  <th className="text-right py-2 px-3 font-bold">YTD Target</th>
                  <th className="text-right py-2 px-3 font-bold">YTD Achieved</th>
                  <th className="text-right py-2 pl-3 font-bold">Achievement %</th>
                </tr>
              </thead>
              <tbody>
                {bds.map((r, i) => (
                  <tr key={`${r.bd}-${i}`} className="border-b border-border-subtle/40 hover:bg-surface/30 transition-colors">
                    <td className="py-2.5 pr-3">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-surface text-text-secondary text-xs font-bold tabular-nums">
                        {r.rank ?? i + 1}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-text-secondary">{r.region || '—'}</td>
                    <td className="py-2.5 px-3 text-text-secondary">{r.regionHead || '—'}</td>
                    <td className="py-2.5 px-3 text-white font-bold">{r.bd || '—'}</td>
                    <td className="py-2.5 px-3 text-right text-text-secondary tabular-nums">{num(r.ytdTarget)}</td>
                    <td className="py-2.5 px-3 text-right text-white tabular-nums">{r.ytdAchievement ?? 0}</td>
                    <td className="py-2.5 pl-3 text-right"><PctBar p={r.achievementPct} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile stacked cards (< md) */}
          <div className="md:hidden flex flex-col gap-3">
            {bds.map((r, i) => (
              <MobileStatCard
                key={`m-${r.bd}-${i}`}
                badge={<RankChip n={r.rank ?? i + 1} />}
                title={r.bd || '—'}
                subtitle={r.region || '—'}
                headlineLabel="Achieved"
                headline={pctText(r.achievementPct)}
                headlineAccent={pctColor(r.achievementPct)}
                secondary={[
                  { label: 'YTD Achieved', value: r.ytdAchievement ?? 0 },
                  { label: 'YTD Target', value: num(r.ytdTarget) },
                ]}
                details={[
                  { label: 'Region Head', value: r.regionHead || '—' },
                  { label: 'Region', value: r.region || '—' },
                ]}
              />
            ))}
          </div>
        </div>
      )}

      {/* Region-wise ranking */}
      {regions.length > 0 && (
        <div className="glass-panel p-4 sm:p-6">
          <div className="flex items-center justify-between gap-2 mb-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-white flex items-center gap-2">
              <Map className="w-4 h-4 text-brand-purple-400" /> Region Ranking
            </h2>
            <NotAffectedBadge dims={rowFilterDims} title="Region Ranking measures fiscal-year-to-date points against fiscal-year targets, so it cannot be windowed to a date range." />
          </div>

          {/* Desktop table (unchanged >= md) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-widest text-text-secondary border-b border-border-subtle">
                  <th className="text-left py-2 pr-3 font-bold">Rank</th>
                  <th className="text-left py-2 px-3 font-bold">Region</th>
                  <th className="text-left py-2 px-3 font-bold">Region Head</th>
                  <th className="text-right py-2 px-3 font-bold">BDs</th>
                  <th className="text-right py-2 px-3 font-bold">YTD Target</th>
                  <th className="text-right py-2 px-3 font-bold">YTD Achieved</th>
                  <th className="text-right py-2 pl-3 font-bold">Achievement %</th>
                </tr>
              </thead>
              <tbody>
                {regions.map((r, i) => (
                  <tr key={`${r.region}-${i}`} className="border-b border-border-subtle/40 hover:bg-surface/30 transition-colors">
                    <td className="py-2.5 pr-3">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-surface text-text-secondary text-xs font-bold tabular-nums">
                        {r.rank ?? i + 1}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-white font-bold">{r.region || '—'}</td>
                    <td className="py-2.5 px-3 text-text-secondary">{r.regionHead || '—'}</td>
                    <td className="py-2.5 px-3 text-right text-text-secondary tabular-nums">{r.bds != null ? num(r.bds) : '—'}</td>
                    <td className="py-2.5 px-3 text-right text-text-secondary tabular-nums">{num(r.ytdTarget)}</td>
                    <td className="py-2.5 px-3 text-right text-white tabular-nums">{r.ytdAchievement ?? 0}</td>
                    <td className="py-2.5 pl-3 text-right"><PctBar p={r.achievementPct} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile stacked cards (< md) */}
          <div className="md:hidden flex flex-col gap-3">
            {regions.map((r, i) => (
              <MobileStatCard
                key={`m-${r.region}-${i}`}
                badge={<RankChip n={r.rank ?? i + 1} />}
                title={r.region || '—'}
                subtitle={r.regionHead ? `Head · ${r.regionHead}` : undefined}
                headlineLabel="Achieved"
                headline={pctText(r.achievementPct)}
                headlineAccent={pctColor(r.achievementPct)}
                secondary={[
                  { label: 'YTD Achieved', value: r.ytdAchievement ?? 0 },
                  { label: 'YTD Target', value: num(r.ytdTarget) },
                  { label: 'BDs', value: r.bds != null ? num(r.bds) : '—' },
                ]}
                details={[
                  { label: 'Region Head', value: r.regionHead || '—' },
                ]}
              />
            ))}
          </div>
        </div>
      )}

      {/* Region heads — listed separately from the BD ranking, no individual rank */}
      {regionHeads.length > 0 && (
        <div className="glass-panel p-4 sm:p-6">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h2 className="text-xs font-bold uppercase tracking-widest text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-brand-purple-400" /> Region Heads
            </h2>
            <NotAffectedBadge dims={rowFilterDims} title="Region-head standings are fiscal-year-to-date against fiscal-year targets, so they cannot be windowed to a date range." />
          </div>
          <InfoNote
            desktopClassName="text-[11px] text-text-secondary mb-4 leading-relaxed"
            mobileLabel="About region heads"
            title="Region heads"
          >
            Region heads are shown separately and carry no individual BD rank — they are excluded from the BD ranking above.
          </InfoNote>

          {/* Desktop table (unchanged >= md) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-widest text-text-secondary border-b border-border-subtle">
                  <th className="text-left py-2 pr-3 font-bold">Region Head</th>
                  <th className="text-left py-2 px-3 font-bold">Region</th>
                  <th className="text-right py-2 px-3 font-bold">YTD Target</th>
                  <th className="text-right py-2 px-3 font-bold">YTD Achieved</th>
                  <th className="text-right py-2 pl-3 font-bold">Achievement %</th>
                </tr>
              </thead>
              <tbody>
                {regionHeads.map((r, i) => (
                  <tr key={`${r.bd}-${i}`} className="border-b border-border-subtle/40 hover:bg-surface/30 transition-colors">
                    <td className="py-2.5 pr-3 text-white font-bold">
                      {r.bd || '—'}
                      <span className="ml-2 text-[9px] uppercase tracking-wider text-brand-purple-300 bg-brand-purple-900/40 border border-brand-purple-500/30 px-1.5 py-0.5 rounded">Region Head</span>
                    </td>
                    <td className="py-2.5 px-3 text-text-secondary">{r.region || '—'}</td>
                    <td className="py-2.5 px-3 text-right text-text-secondary tabular-nums">{num(r.ytdTarget)}</td>
                    <td className="py-2.5 px-3 text-right text-white tabular-nums">{r.ytdAchievement ?? 0}</td>
                    <td className="py-2.5 pl-3 text-right"><PctBar p={r.achievementPct} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile stacked cards (< md) */}
          <div className="md:hidden flex flex-col gap-3">
            {regionHeads.map((r, i) => (
              <MobileStatCard
                key={`m-${r.bd}-${i}`}
                title={r.bd || '—'}
                subtitle="Region Head"
                headlineLabel="Achieved"
                headline={pctText(r.achievementPct)}
                headlineAccent={pctColor(r.achievementPct)}
                secondary={[
                  { label: 'YTD Achieved', value: r.ytdAchievement ?? 0 },
                  { label: 'YTD Target', value: num(r.ytdTarget) },
                  { label: 'Region', value: r.region || '—' },
                ]}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
