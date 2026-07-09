'use client';

import { useMemo, useState } from 'react';
import { useDashboard } from '@/lib/DashboardContext';
import { Users, Search, Phone, Mail } from 'lucide-react';
import type { OrgBD } from '@/lib/types';
import { CsvButton } from '@/components/CsvButton';

interface DirRow {
  name: string;
  region: string;
  regionHead: string;
  zoom: string;
  email: string;
  isHead: boolean;
}

export function BDDirectory() {
  const { data } = useDashboard();
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState<string>('All');

  const rows = useMemo<DirRow[]>(() => {
    const bds = data?.org?.bds;
    if (!bds) return [];
    return Object.entries(bds)
      .map(([name, v]: [string, OrgBD]) => ({
        name,
        region: v.region || '—',
        regionHead: v.regionHead || '—',
        zoom: v.zoom || '—',
        email: v.email || '—',
        isHead: !!v.isHead,
      }))
      .sort((a, b) => a.region.localeCompare(b.region) || a.name.localeCompare(b.name));
  }, [data]);

  const regionOptions = useMemo(() => {
    const set = new Set(rows.map((r) => r.region));
    return ['All', ...Array.from(set).sort()];
  }, [rows]);

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;

  const matchRow = (r: DirRow) =>
    r.name.toLowerCase().includes(q) ||
    r.region.toLowerCase().includes(q) ||
    r.regionHead.toLowerCase().includes(q) ||
    r.email.toLowerCase().includes(q) ||
    r.zoom.toLowerCase().includes(q);

  // P1-7: rows for the active region tab (no query) — powers the idle counter.
  const tabRows = useMemo(
    () => (region === 'All' ? rows : rows.filter((r) => r.region === region)),
    [rows, region]
  );

  // P1-7: when searching, match ACROSS ALL regions (ignore the active tab) so a
  // name that lives in another region is never dead-ended behind "0 of 27".
  const matches = useMemo(
    () => (searching ? rows.filter(matchRow) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, q, searching]
  );

  const filtered = searching ? matches : tabRows;

  // How many matches fall outside the currently-selected tab (affordance copy).
  const outsideActiveTab = useMemo(
    () => (searching && region !== 'All' ? matches.filter((r) => r.region !== region).length : 0),
    [searching, region, matches]
  );

  // Counter: idle → "n of {active tab size}"; searching → "n match(es)".
  const counterLabel = searching
    ? `${matches.length} match${matches.length === 1 ? '' : 'es'}`
    : `${tabRows.length} of ${tabRows.length}`;

  if (!data?.org?.bds || rows.length === 0) return null;

  return (
    <div className="glass-panel p-4 sm:p-6 flex flex-col relative z-10">
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <h2 className="text-xs font-bold uppercase tracking-widest text-white flex items-center gap-2">
          <Users className="w-4 h-4 text-brand-pink-400" /> BD Directory
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary bg-surface px-2 py-1 rounded">
            {counterLabel}
          </span>
          <CsvButton
            base={`directory${region !== 'All' ? '-' + region.toLowerCase().replace(/[^a-z0-9]+/g, '-') : ''}`}
            filters={null}
            columns={[
              { key: 'region', label: 'Region' },
              { key: 'regionHead', label: 'Region Head' },
              { key: 'name', label: 'BD Name' },
              { key: 'zoom', label: 'Zoom' },
              { key: 'email', label: 'Email' },
            ]}
            rows={filtered}
          />
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-text-secondary absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, region, email…"
            className="w-full h-10 pl-9 pr-3 rounded-lg bg-black/40 border border-border-subtle text-sm text-white placeholder:text-text-secondary/70 focus:outline-none focus:border-brand-pink-500/60 transition-colors"
          />
        </div>
        <div className="flex flex-wrap gap-1.5 items-center">
          {regionOptions.map((r) => (
            <button
              key={r}
              onClick={() => setRegion(r)}
              className={
                'px-2.5 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ' +
                (region === r
                  ? 'bg-brand-pink-500 text-white shadow-[0_0_10px_rgba(218,26,132,0.4)]'
                  : 'bg-surface text-text-secondary hover:text-white')
              }
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* P1-7: cross-region search affordance — surfaces matches that live
          outside the active tab so a name is never invisible behind it. */}
      {searching && (
        <div className="mb-4 -mt-1 text-xs text-text-secondary">
          {matches.length === 0 ? (
            <span>No BDs match “{query.trim()}”.</span>
          ) : region === 'All' ? (
            <span className="text-text-secondary/80">
              Searching across all regions — {matches.length} match{matches.length === 1 ? '' : 'es'}.
            </span>
          ) : outsideActiveTab > 0 ? (
            <span className="text-brand-pink-400">
              Showing all {matches.length} match{matches.length === 1 ? '' : 'es'} across every region
              {` (${outsideActiveTab} outside ${region}).`}
            </span>
          ) : (
            <span className="text-text-secondary/80">
              {matches.length} match{matches.length === 1 ? '' : 'es'} — all within {region}.
            </span>
          )}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-widest text-text-secondary border-b border-border-subtle">
              <th className="text-left py-2 pr-3 font-bold">Region</th>
              <th className="text-left py-2 px-3 font-bold">Region Head</th>
              <th className="text-left py-2 px-3 font-bold">BD Name</th>
              <th className="text-left py-2 px-3 font-bold">Zoom</th>
              <th className="text-left py-2 pl-3 font-bold">Email</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.name} className="border-b border-border-subtle/40 hover:bg-surface/30 transition-colors">
                <td className="py-2.5 pr-3 text-text-secondary">{r.region}</td>
                <td className="py-2.5 px-3 text-text-secondary">{r.regionHead}</td>
                <td className="py-2.5 px-3 text-white font-bold">
                  {r.name}
                  {r.isHead && (
                    <span className="ml-2 px-1.5 py-0.5 rounded bg-brand-purple-500/20 border border-brand-purple-400/40 text-brand-purple-300 text-[9px] uppercase tracking-widest">
                      Head
                    </span>
                  )}
                </td>
                <td className="py-2.5 px-3">
                  {r.zoom === '—' ? (
                    <span className="text-text-secondary">—</span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-text-secondary tabular-nums">
                      <Phone className="w-3 h-3 text-brand-pink-400/70" />
                      {r.zoom}
                    </span>
                  )}
                </td>
                <td className="py-2.5 pl-3">
                  {r.email === '—' ? (
                    <span className="text-text-secondary">—</span>
                  ) : (
                    <a
                      href={`mailto:${r.email}`}
                      className="inline-flex items-center gap-1.5 text-brand-pink-400 hover:text-brand-pink-300 transition-colors"
                    >
                      <Mail className="w-3 h-3" />
                      {r.email}
                    </a>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-text-secondary">
                  No BDs match your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
