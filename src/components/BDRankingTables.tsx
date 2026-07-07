'use client';

import { useMemo } from 'react';
import { useDashboard } from '@/lib/DashboardContext';
import { Trophy, Map } from 'lucide-react';
import { num } from '@/lib/format';

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

export function BDRankingTables() {
  const { data } = useDashboard();
  const ranking = data?.deals?.ranking;

  const bds = useMemo<BDRank[]>(() => {
    const list = ranking?.bds;
    if (!Array.isArray(list)) return [];
    return [...list].sort((a: BDRank, b: BDRank) => (a.rank ?? 999) - (b.rank ?? 999));
  }, [ranking]);

  const regions = useMemo<RegionRank[]>(() => {
    const list = ranking?.regions;
    if (!Array.isArray(list)) return [];
    return [...list].sort((a: RegionRank, b: RegionRank) => (a.rank ?? 999) - (b.rank ?? 999));
  }, [ranking]);

  if (!ranking || (bds.length === 0 && regions.length === 0)) return null;

  const rule =
    ranking?.meta?.pointRules ||
    'Olive MA = 1, Open MA = 0.5, Spark counted at LOI = 1 (Spark MA not counted). Target = 1 point / BD / month.';

  return (
    <div className="flex flex-col gap-4 sm:gap-6 relative z-10">
      {/* BD-wise ranking */}
      {bds.length > 0 && (
        <div className="glass-panel p-4 sm:p-6">
          <h2 className="text-xs font-bold uppercase tracking-widest text-white flex items-center gap-2 mb-2">
            <Trophy className="w-4 h-4 text-brand-pink-400" /> BD Ranking (points-based)
          </h2>
          <p className="text-[11px] text-text-secondary mb-4 leading-relaxed">{rule}</p>
          <div className="overflow-x-auto">
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
        </div>
      )}

      {/* Region-wise ranking */}
      {regions.length > 0 && (
        <div className="glass-panel p-4 sm:p-6">
          <h2 className="text-xs font-bold uppercase tracking-widest text-white flex items-center gap-2 mb-4">
            <Map className="w-4 h-4 text-brand-purple-400" /> Region Ranking
          </h2>
          <div className="overflow-x-auto">
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
        </div>
      )}
    </div>
  );
}
