'use client';

import { useMemo } from 'react';
import { useDashboard } from '@/lib/DashboardContext';
import { PhoneCall } from 'lucide-react';

function fmtDuration(seconds: number | null): string {
  if (seconds == null || !isFinite(seconds) || seconds <= 0) return '—';
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

export function CallingQualityCard() {
  const { data } = useDashboard();

  const stats = useMemo(() => {
    const bds = data?.bds;
    if (!bds) return null;

    const entries = Object.entries(bds);
    let totalOut = 0, totalConn = 0, totalRec = 0;
    let weightedAvgNum = 0, weightedAvgDen = 0;

    const callers: { name: string; out: number; conn: number; rate: number }[] = [];
    let bestCoach: { name: string; overall: number } | null = null;
    let coachSum = 0, coachCount = 0;
    let noAccountCount = 0;

    entries.forEach(([name, bd]) => {
      const z = bd.zoom;
      if (z && z.out) {
        totalOut += z.out || 0;
        totalConn += z.conn || 0;
        totalRec += z.rec || 0;
        if (z.avg != null && isFinite(z.avg) && z.conn > 0) {
          weightedAvgNum += z.avg * z.conn;
          weightedAvgDen += z.conn;
        }
        const rate = z.connect_rate != null && isFinite(z.connect_rate)
          ? z.connect_rate
          : (z.out > 0 ? (z.conn / z.out) * 100 : 0);
        if (z.out >= 20) {
          callers.push({ name, out: z.out, conn: z.conn, rate });
        }
      }

      if (bd.q && isFinite(bd.q.overall)) {
        coachSum += bd.q.overall;
        coachCount += 1;
        if (!bestCoach || bd.q.overall > bestCoach.overall) {
          bestCoach = { name, overall: bd.q.overall };
        }
      }

      if (!(z && z.out) && !bd.q) noAccountCount += 1;
    });

    const topCallers = callers.sort((a, b) => b.rate - a.rate).slice(0, 5);
    const connectRate = totalOut > 0 ? (totalConn / totalOut) * 100 : 0;
    const avgAnswered = weightedAvgDen > 0 ? weightedAvgNum / weightedAvgDen : null;
    const teamCoachAvg = coachCount > 0 ? coachSum / coachCount : null;

    return {
      totalOut, totalConn, totalRec, connectRate, avgAnswered,
      topCallers, bestCoach: bestCoach as { name: string; overall: number } | null,
      teamCoachAvg, noAccountCount, hasZoom: totalOut > 0,
    };
  }, [data]);

  if (!stats || (!stats.hasZoom && !stats.bestCoach)) {
    return (
      <div className="glass-panel p-4 sm:p-6 flex flex-col">
        <div className="flex items-center gap-2 mb-4">
          <PhoneCall className="w-4 h-4 text-brand-pink-500" />
          <h3 className="text-xs font-bold uppercase tracking-widest text-white">BD Calling Quality</h3>
        </div>
        <p className="text-xs text-text-secondary">No calling data available yet.</p>
      </div>
    );
  }

  const tiles = [
    { label: 'Outreach', value: stats.totalOut.toLocaleString(), sub: 'outbound calls' },
    { label: 'Connects', value: stats.totalConn.toLocaleString(), sub: `${stats.connectRate.toFixed(0)}% connect rate` },
    { label: 'Recordings', value: stats.totalRec.toLocaleString(), sub: 'answered & recorded' },
    { label: 'Avg Answered', value: fmtDuration(stats.avgAnswered), sub: 'per connected call' },
  ];

  return (
    <div className="glass-panel p-4 sm:p-6 flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <PhoneCall className="w-4 h-4 text-brand-pink-500" />
        <h3 className="text-xs font-bold uppercase tracking-widest text-white">BD Calling Quality</h3>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        {tiles.map(t => (
          <div key={t.label} className="flex flex-col p-3 rounded-xl border border-border-subtle/50 bg-black/20">
            <span className="text-xl font-black tracking-tight text-white leading-none">{t.value}</span>
            <span className="text-[10px] uppercase tracking-widest font-bold text-text-secondary mt-1.5">{t.label}</span>
            <span className="text-[10px] text-text-secondary mt-0.5">{t.sub}</span>
          </div>
        ))}
      </div>

      {stats.topCallers.length > 0 && (
        <div className="mt-4">
          <p className="text-[10px] uppercase tracking-widest font-bold text-text-secondary mb-2">Top Callers (out ≥ 20)</p>
          <ul className="space-y-1.5">
            {stats.topCallers.map((c, i) => (
              <li key={c.name} className="flex items-center gap-2 text-xs">
                <span className="w-4 text-text-secondary font-bold shrink-0">{i + 1}</span>
                <span className="text-white truncate">{c.name}</span>
                <span className="ml-auto text-text-secondary whitespace-nowrap">{c.conn.toLocaleString()}/{c.out.toLocaleString()}</span>
                <span className="font-bold text-emerald-400 whitespace-nowrap w-12 text-right">{c.rate.toFixed(0)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(stats.bestCoach || stats.teamCoachAvg != null) && (
        <div className="mt-4 pt-3 border-t border-border-subtle/40 flex items-center justify-between gap-3 text-xs">
          {stats.bestCoach && (
            <div className="min-w-0">
              <span className="text-[10px] uppercase tracking-widest font-bold text-text-secondary block">Best Coaching Score</span>
              <span className="text-white font-semibold truncate block">
                {stats.bestCoach.name} <span className="text-brand-pink-500">{stats.bestCoach.overall.toFixed(1)}/10</span>
              </span>
            </div>
          )}
          {stats.teamCoachAvg != null && (
            <div className="text-right shrink-0">
              <span className="text-[10px] uppercase tracking-widest font-bold text-text-secondary block">Team Avg</span>
              <span className="text-white font-semibold">{stats.teamCoachAvg.toFixed(1)}/10</span>
            </div>
          )}
        </div>
      )}

      {stats.noAccountCount > 0 && (
        <p className="mt-2 text-[10px] text-text-secondary">
          {stats.noAccountCount} BD{stats.noAccountCount === 1 ? '' : 's'} with no Zoom account or coaching score — excluded above.
        </p>
      )}
    </div>
  );
}
