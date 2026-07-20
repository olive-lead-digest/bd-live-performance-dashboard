'use client';

import { useDashboard } from '@/lib/DashboardContext';
import { useMemo, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend,
  PieChart, Pie, Cell, ScatterChart, Scatter, ZAxis
} from 'recharts';
import clsx from 'clsx';
import { TrendingUp, TrendingDown, CalendarDays, Search, PhoneCall, Users, PlaySquare, Percent, User, Trophy, AlertTriangle, ShieldCheck, ChevronDown } from 'lucide-react';
import { calculateRates, buildLeaderboard, brandKey, rosterOwnerSet } from '@/lib/utils';
import { ExecSummary, SummaryBullet } from '@/components/ExecSummary';
import { CsvButton } from '@/components/CsvButton';

export default function Reporting() {
  const { filteredLeads, data, isLoading, filters } = useDashboard();
  const [searchQuery, setSearchQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);

  const bds = data?.bds || {};
  const weights = data?.weights || { Q: 1, Cv: 1, Cmp: 1, Lv: 1, Cav: 1 };

  const suggestions = useMemo(() => {
    if (!searchQuery.trim() || !isFocused) return [];
    const query = searchQuery.trim().toLowerCase();

    const options = new Set<string>();

    if ('spark'.includes(query)) options.add('Spark');
    if ('open hotels'.includes(query)) options.add('Open Hotels');
    if ('olive'.includes(query)) options.add('Olive');

    filteredLeads.forEach(l => {
      if (l.owner && l.owner.toLowerCase().includes(query)) options.add(l.owner);
      if (l.region && l.region.toLowerCase().includes(query)) options.add(l.region);
      if (l.city && l.city.toLowerCase().includes(query)) options.add(l.city);
    });

    return Array.from(options).filter(opt => opt.toLowerCase() !== query).slice(0, 8);
  }, [filteredLeads, searchQuery, isFocused]);

  const reportData = useMemo(() => {
    if (!filteredLeads.length) return null;

    const query = searchQuery.trim().toLowerCase();
    const allOwners = new Set(filteredLeads.map(l => l.owner?.toLowerCase()).filter(Boolean));
    const isPersonSearch = allOwners.has(query);
    const isBrandSearch = query === 'spark' || query === 'open hotels' || query === 'olive';
    const isLocationSearch = query !== '' && !isPersonSearch && !isBrandSearch;

    const searchFiltered = filteredLeads.filter(l => {
      if (!query) return true;
      if (isBrandSearch) return l.brand && l.brand.toLowerCase() === query;
      return (
        (l.owner && l.owner.toLowerCase().includes(query)) ||
        (l.region && l.region.toLowerCase().includes(query)) ||
        (l.city && l.city.toLowerCase().includes(query))
      );
    });

    if (!searchFiltered.length && !isBrandSearch) {
      return { isEmpty: true, currName: "", prevName: "", currDay: 1 };
    }

    // Date-UNFILTERED base (analyst fix — the calendar filter previously "did
    // nothing useful" here because restricting to one month wiped out the prior
    // month, so the MTD-vs-prior comparison always compared against zero). This
    // base respects every NON-date global filter + the on-page search but ignores
    // the from/to range, so the prior period never collapses. The CURRENT period
    // still comes from the date-filtered set, so a selected range genuinely
    // narrows the current view.
    const passNonDate = (l: any) => {
      if (filters.region.size && !filters.region.has(l.region)) return false;
      if (filters.state.size && !filters.state.has(l.state)) return false;
      if (filters.city.size && !filters.city.has(l.city)) return false;
      if (filters.cluster.size && !filters.cluster.has(l.cluster)) return false;
      if (filters.brand.size && !filters.brand.has(l.brand)) return false;
      if (filters.owner.size && !(l.owner && filters.owner.has(l.owner))) return false;
      if (filters.prop.size && !filters.prop.has(l.prop)) return false;
      if (filters.status.size && !filters.status.has(l.status || '(unassigned)')) return false;
      return true;
    };
    const baseSearch = (data?.leads || []).filter(passNonDate).filter(l => {
      if (!query) return true;
      if (isBrandSearch) return !!l.brand && l.brand.toLowerCase() === query;
      return (
        (!!l.owner && l.owner.toLowerCase().includes(query)) ||
        (!!l.region && l.region.toLowerCase().includes(query)) ||
        (!!l.city && l.city.toLowerCase().includes(query))
      );
    });

    // --- Date window (analyst FIX — the global date range now drives this page) --
    // Default: month-to-date around the latest lead, compared to the prior month
    // (unchanged). When a GLOBAL date range (from/to) is active, honour it
    // literally: the CURRENT window is exactly [from,to] and the comparison is the
    // equal-length window immediately before it — so the lead-volume figures, the
    // daily chart and the pill label all track the selected range (previously the
    // page re-imposed a fixed current-month window and ignored the range).
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const parseISO = (s: string) => { const [y, m, dd] = s.split('-').map(Number); return new Date(y, (m || 1) - 1, dd || 1); };
    const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
    const fmtShort = (iso: string) => { const d = parseISO(iso); return `${monthNames[d.getMonth()]} ${d.getDate()}`; };

    const maxDate = filteredLeads.reduce((max, l) => l.dt > max ? l.dt : max, '2000-01-01');
    const minDate = filteredLeads.reduce((min, l) => l.dt < min ? l.dt : min, maxDate);
    const hasDateRange = !!(filters.from || filters.to);

    let currName: string, prevName: string, currDay: number;
    let pillLabel: string, compareLabel: string;
    let currentLeads: any[], previousLeads: any[];
    let chartData: any[];

    if (hasDateRange) {
      // ---- RANGE MODE: current = selected [from,to]; prev = equal window before.
      let curStartISO = filters.from || minDate;
      let curEndISO = filters.to || maxDate;
      if (curStartISO > curEndISO) { const t = curStartISO; curStartISO = curEndISO; curEndISO = t; }
      const cs = parseISO(curStartISO), ce = parseISO(curEndISO);
      const spanDays = Math.max(1, Math.round((ce.getTime() - cs.getTime()) / 86400000) + 1);
      const pe = addDays(cs, -1), ps = addDays(pe, -(spanDays - 1));
      const prevStartISO = isoOf(ps), prevEndISO = isoOf(pe);

      currName = monthNames[ce.getMonth()];
      prevName = monthNames[pe.getMonth()];
      currDay = ce.getDate();
      pillLabel = `${fmtShort(curStartISO)} – ${fmtShort(curEndISO)}`;
      compareLabel = `${fmtShort(prevStartISO)}–${fmtShort(prevEndISO)}`;

      currentLeads = searchFiltered.filter(l => l.dt >= curStartISO && l.dt <= curEndISO);
      // Prior period from the date-UNFILTERED base so a selected range never zeroes it out.
      previousLeads = baseSearch.filter(l => l.dt >= prevStartISO && l.dt <= prevEndISO);

      const rows: any[] = [];
      const curById: Record<string, any> = {};
      const prevByDate: Record<string, any> = {};
      for (let i = 0; i < spanDays; i++) {
        const cIso = isoOf(addDays(cs, i));
        const pIso = isoOf(addDays(ps, i));
        const row: any = isBrandSearch
          ? { day: i + 1, date: cIso, spark: 0, olive: 0, open: 0 }
          : { day: i + 1, date: cIso, prevDate: pIso, curr: 0, prev: 0 };
        rows.push(row);
        curById[cIso] = row;
        if (!isBrandSearch) prevByDate[pIso] = row;
      }
      if (isBrandSearch) {
        filteredLeads.filter(l => l.dt >= curStartISO && l.dt <= curEndISO).forEach(l => {
          const row = curById[l.dt];
          const bk = brandKey(l.brand);
          if (row && bk && row[bk] !== undefined) row[bk]++;
        });
      } else {
        currentLeads.forEach(l => { const row = curById[l.dt]; if (row) row.curr++; });
        previousLeads.forEach(l => { const row = prevByDate[l.dt]; if (row) row.prev++; });
      }
      chartData = rows;
    } else {
      // ---- DEFAULT MODE: month-to-date vs the prior month (unchanged behaviour).
      const currDate = new Date(maxDate);
      const currYear = currDate.getFullYear();
      const currMonth = currDate.getMonth();
      currDay = currDate.getDate();
      const prevMonthDate = new Date(currYear, currMonth - 1, currDay);
      const prevMonth = prevMonthDate.getMonth();
      const prevYear = prevMonthDate.getFullYear();

      const currMonthPrefix = `${currYear}-${String(currMonth + 1).padStart(2, '0')}`;
      const prevMonthPrefix = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}`;
      currName = monthNames[currMonth];
      prevName = monthNames[prevMonth];
      pillLabel = `${currName} 1-${currDay}`;
      compareLabel = `${prevName} 1-${currDay}`;

      currentLeads = searchFiltered.filter(l => l.dt.startsWith(currMonthPrefix) && parseInt(l.dt.split('-')[2]) <= currDay);
      // Prior period drawn from the date-UNFILTERED base so a selected range never zeroes it out.
      previousLeads = baseSearch.filter(l => l.dt.startsWith(prevMonthPrefix) && parseInt(l.dt.split('-')[2]) <= currDay);

      const dailyMap: Record<number, any> = {};
      for (let i = 1; i <= currDay; i++) {
        if (isBrandSearch) dailyMap[i] = { day: i, spark: 0, open: 0, olive: 0 };
        else dailyMap[i] = { day: i, curr: 0, prev: 0 };
      }
      if (isBrandSearch) {
        const currentLeadsAll = filteredLeads.filter(l => l.dt.startsWith(currMonthPrefix) && parseInt(l.dt.split('-')[2]) <= currDay);
        currentLeadsAll.forEach(l => {
          const d = parseInt(l.dt.split('-')[2]);
          const brand = brandKey(l.brand);
          if (dailyMap[d] && brand && dailyMap[d][brand] !== undefined) dailyMap[d][brand]++;
        });
      } else {
        currentLeads.forEach(l => { const d = parseInt(l.dt.split('-')[2]); if (dailyMap[d]) dailyMap[d].curr++; });
        previousLeads.forEach(l => { const d = parseInt(l.dt.split('-')[2]); if (dailyMap[d]) dailyMap[d].prev++; });
      }
      chartData = Object.values(dailyMap).sort((a, b) => a.day - b.day);
    }

    const currRates = calculateRates(currentLeads);
    const prevRates = calculateRates(previousLeads);

    const baseData = {
      isEmpty: false, isPersonSearch, isLocationSearch, isBrandSearch,
      currName, prevName, currDay, pillLabel, compareLabel, rangeMode: hasDateRange,
      currTotal: currentLeads.length, prevTotal: previousLeads.length,
      currActive: currRates.active, prevActive: prevRates.active,
      chartData, zoomStats: { outreach: 0, connects: 0, recordings: 0, connectRate: 0 }
    };

    // P1-8: roster-aware — reps not in bd_org.json are tagged inactive and
    // excluded from band counts / percentages so Reporting matches Leaderboard.
    const roster = rosterOwnerSet(data?.org);
    const leaderboardRecs = buildLeaderboard(searchFiltered, bds, weights, roster);

    if (isPersonSearch) {
      // --- PERSON DASHBOARD ---
      const globalLeaderboard = buildLeaderboard(filteredLeads, bds, weights, roster);
      const personRec = globalLeaderboard.find(r => r.owner.toLowerCase() === query);

      let gSoft=0, gBrand=0, gPitch=0, gSales=0, gConv=0, gDisc=0, gObj=0, gClose=0;
      let validQCount = 0;
      globalLeaderboard.forEach(r => {
        if (r.q) {
          validQCount++;
          gSoft += r.q.soft_skills; gBrand += r.q.brand_alignment; gPitch += r.q.pitch_clarity;
          gSales += r.q.sales_skill; gConv += r.q.conversion_skill; gDisc += r.q.discovery_quality;
          gObj += r.q.objection_handling; gClose += r.q.closing_discipline;
        }
      });

      const p = personRec?.q;
      let radarData: any[] = [];
      if (p) {
        radarData = [
          { subject: 'Soft Skills', Person: Math.round(p.soft_skills * 10), Global: Math.round((gSoft/validQCount)*10) },
          { subject: 'Brand Align', Person: Math.round(p.brand_alignment * 10), Global: Math.round((gBrand/validQCount)*10) },
          { subject: 'Pitch Clarity', Person: Math.round(p.pitch_clarity * 10), Global: Math.round((gPitch/validQCount)*10) },
          { subject: 'Sales Skill', Person: Math.round(p.sales_skill * 10), Global: Math.round((gSales/validQCount)*10) },
          { subject: 'Conversion', Person: Math.round(p.conversion_skill * 10), Global: Math.round((gConv/validQCount)*10) },
          { subject: 'Discovery', Person: Math.round(p.discovery_quality * 10), Global: Math.round((gDisc/validQCount)*10) },
          { subject: 'Objection', Person: Math.round(p.objection_handling * 10), Global: Math.round((gObj/validQCount)*10) },
          { subject: 'Closing', Person: Math.round(p.closing_discipline * 10), Global: Math.round((gClose/validQCount)*10) },
        ];
      }

      if (personRec?.bd?.zoom) {
        baseData.zoomStats = {
          outreach: personRec.bd.zoom.out, connects: personRec.bd.zoom.conn,
          recordings: personRec.bd.zoom.rec, connectRate: (personRec.bd.zoom.conn / personRec.bd.zoom.out) * 100
        };
      }

      const rank = globalLeaderboard.findIndex(r => r.owner.toLowerCase() === query) + 1;

      return { ...baseData, radarData, personRec, globalRank: rank, totalBDs: globalLeaderboard.length };
    }
    else {
      // --- LOCATION / MACRO DASHBOARD ---
      let bandData = [
        { name: 'Top performer', value: 0, color: '#10b981' },
        { name: 'Strong', value: 0, color: '#3b82f6' },
        { name: 'Developing', value: 0, color: '#f59e0b' },
        { name: 'Priority coaching', value: 0, color: '#ef4444' }
      ];
      let totalZoom = { out: 0, conn: 0, rec: 0 };
      let validBDsWithQ = 0;
      const skillAvgs = { soft_skills: 0, brand_alignment: 0, pitch_clarity: 0, sales_skill: 0, conversion_skill: 0, discovery_quality: 0, objection_handling: 0, closing_discipline: 0 };
      const scatterData: any[] = [];

      leaderboardRecs.forEach(rec => {
        if (rec.inactive) return; // P1-8: not in roster → excluded from bands/percentages
        if (rec.bd?.zoom) {
          totalZoom.out += rec.bd.zoom.out; totalZoom.conn += rec.bd.zoom.conn; totalZoom.rec += rec.bd.zoom.rec;
        }
        if (rec.bps) {
          const bandItem = bandData.find(b => b.name === rec.band);
          if (bandItem) bandItem.value++;
          // Real counts only (analyst correction — no count×₹ estimates).
          const activeCount = Math.round((rec.active / 100) * rec.n);
          scatterData.push({
            name: rec.owner,
            leads: rec.n,
            active: activeCount,
            activeRate: Math.round(rec.active),
          });
        }
        if (rec.q) {
          validBDsWithQ++;
          skillAvgs.soft_skills += rec.q.soft_skills; skillAvgs.brand_alignment += rec.q.brand_alignment; skillAvgs.pitch_clarity += rec.q.pitch_clarity;
          skillAvgs.sales_skill += rec.q.sales_skill; skillAvgs.conversion_skill += rec.q.conversion_skill; skillAvgs.discovery_quality += rec.q.discovery_quality;
          skillAvgs.objection_handling += rec.q.objection_handling; skillAvgs.closing_discipline += rec.q.closing_discipline;
        }
      });

      let radarData: any[] = [];
      if (validBDsWithQ > 0) {
        radarData = [
          { subject: 'Soft Skills', A: Math.round((skillAvgs.soft_skills / validBDsWithQ) * 10) },
          { subject: 'Brand Align', A: Math.round((skillAvgs.brand_alignment / validBDsWithQ) * 10) },
          { subject: 'Pitch Clarity', A: Math.round((skillAvgs.pitch_clarity / validBDsWithQ) * 10) },
          { subject: 'Sales Skill', A: Math.round((skillAvgs.sales_skill / validBDsWithQ) * 10) },
          { subject: 'Conversion', A: Math.round((skillAvgs.conversion_skill / validBDsWithQ) * 10) },
          { subject: 'Discovery', A: Math.round((skillAvgs.discovery_quality / validBDsWithQ) * 10) },
          { subject: 'Objection', A: Math.round((skillAvgs.objection_handling / validBDsWithQ) * 10) },
          { subject: 'Closing', A: Math.round((skillAvgs.closing_discipline / validBDsWithQ) * 10) },
        ];
      }

      baseData.zoomStats = {
        outreach: totalZoom.out, connects: totalZoom.conn, recordings: totalZoom.rec,
        connectRate: totalZoom.out > 0 ? (totalZoom.conn / totalZoom.out) * 100 : 0
      };
      bandData = bandData.filter(b => b.value > 0);

      // --- LOCATION SPECIFIC METRICS ---
      let localLeaderboard: any[] = [];
      let statusCounts: any[] = [];
      let brandCounts: any[] = [];

      if (isLocationSearch) {
         localLeaderboard = [...leaderboardRecs].sort((a, b) => (b.bps?.score || 0) - (a.bps?.score || 0)).slice(0, 5);

         const sCounts: Record<string, number> = {};
         const bCounts: Record<string, number> = {};
         searchFiltered.forEach(l => {
           const s = l.status || 'New Leads';

           // Group into Macro Stages to reduce bar clutter.
           // Mapped to the real status taxonomy: New/Contacted -> Discovery,
           // Under Discussion -> Engagement, Awaiting Business Approval -> High Intent,
           // Closure/Won/Signed -> Won, Lead Dropped/Lost/Junk -> Lost.
           let stage = 'Other';
           const sLower = s.toLowerCase();
           if (sLower.includes('new') || sLower.includes('contact') || sLower.includes('follow') || sLower.includes('attempt')) stage = 'Discovery';
           else if (sLower.includes('discuss') || sLower.includes('meet') || sLower.includes('propos') || sLower.includes('qual')) stage = 'Engagement';
           else if (sLower.includes('await') || sLower.includes('approv') || sLower.includes('site') || sLower.includes('nego')) stage = 'High Intent';
           else if (sLower.includes('closur') || sLower.includes('won') || sLower.includes('sign')) stage = 'Won';
           else if (sLower.includes('drop') || sLower.includes('lost') || sLower.includes('dead') || sLower.includes('junk') || sLower.includes('not int') || sLower.includes('not qual')) stage = 'Lost';

           sCounts[stage] = (sCounts[stage] || 0) + 1;

           const b = l.brand || 'Olive';
           bCounts[b] = (bCounts[b] || 0) + 1;
         });

         statusCounts = Object.entries(sCounts).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value);
         brandCounts = Object.entries(bCounts).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value);
      }

      return { ...baseData, scatterData, bandData, radarData, localLeaderboard, statusCounts, brandCounts };
    }
  }, [filteredLeads, bds, weights, searchQuery, filters, data]);

  const summaryBullets = useMemo<SummaryBullet[]>(() => {
    const rd: any = reportData;
    if (!rd || rd.isEmpty) return [];
    const b: SummaryBullet[] = [];
    const prefix = searchQuery ? `${searchQuery}: ` : '';
    const volDiff = rd.currTotal - rd.prevTotal;
    const volPct = rd.prevTotal ? (volDiff / rd.prevTotal) * 100 : 0;
    b.push({ tone: volDiff >= 0 ? 'up' : 'down', text: `${prefix}${rd.rangeMode ? 'Selected-range' : 'MTD'} lead volume ${volDiff >= 0 ? 'up' : 'down'} ${Math.abs(volPct).toFixed(0)}% vs ${rd.rangeMode ? 'the prior period' : 'last month'} (${rd.currTotal.toLocaleString()} leads).` });
    const actDiff = rd.currActive - rd.prevActive;
    const actPct = rd.prevActive ? (actDiff / rd.prevActive) * 100 : 0;
    b.push({ tone: actDiff >= 0 ? 'up' : 'down', text: `Active deals ${actDiff >= 0 ? 'up' : 'down'} ${Math.abs(actPct).toFixed(0)}% ${rd.rangeMode ? 'vs the prior period' : 'month-over-month'} (${rd.currActive.toLocaleString()} active).` });
    if (rd.zoomStats) b.push({ tone: rd.zoomStats.connectRate >= 30 ? 'up' : 'warn', text: `Connect rate at ${rd.zoomStats.connectRate.toFixed(0)}% across ${rd.zoomStats.outreach.toLocaleString()} outreach attempts.` });
    if (rd.isPersonSearch && rd.globalRank) b.push({ tone: 'info', text: `${searchQuery} ranks #${rd.globalRank} of ${rd.totalBDs} on the balanced leaderboard.` });
    else if (rd.isLocationSearch && rd.localLeaderboard?.length) b.push({ tone: 'info', text: `Top local performer: ${rd.localLeaderboard[0].owner}.` });
    return b;
  }, [reportData, searchQuery]);

  if (isLoading || !reportData) return null;

  const { isEmpty, isBrandSearch, isPersonSearch, isLocationSearch, currName, prevName, currDay, pillLabel, compareLabel, rangeMode, currTotal, prevTotal, currActive, prevActive, chartData, zoomStats, personRec, globalRank, radarData, localLeaderboard, statusCounts, brandCounts, bandData } = reportData as any;

  const renderComparisonCard = (title: string, currVal: number, prevVal: number, format: (v: number) => string) => {
    const diff = currVal - prevVal;
    const pct = prevVal > 0 ? (diff / prevVal) * 100 : (currVal > 0 ? 100 : 0);
    const isPositive = diff >= 0;

    return (
      <div className="glass-card p-6 flex flex-col justify-between h-full">
        <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">{title}</h3>
        <div className="mt-4 flex items-baseline gap-3">
          <span className="text-2xl sm:text-3xl font-black text-white tracking-tight">{format(currVal)}</span>
          <span className="text-sm font-semibold text-text-secondary">vs {format(prevVal)}</span>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <div className={clsx(
            "px-2 py-1 rounded-md flex items-center gap-1 text-xs font-bold border",
            diff === 0 ? "bg-surface text-text-secondary border-border-subtle" :
            isPositive ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-red-500/20 text-red-400 border-red-500/30"
          )}>
            {diff !== 0 && (isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />)}
            {diff > 0 ? '+' : ''}{format(diff)}
          </div>
          <span className="text-xs font-medium text-text-secondary">
            {diff > 0 ? '+' : ''}{pct.toFixed(1)}% compared to {compareLabel}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="pb-20">
      <header className="mb-6 flex flex-col xl:flex-row xl:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight flex flex-wrap items-center gap-x-3 gap-y-2">
            Growth & Reporting
            {searchQuery && (
              <span className="text-brand-pink-400 text-sm font-semibold bg-brand-pink-500/10 px-2.5 py-1 rounded-md border border-brand-pink-500/20 uppercase tracking-wider">
                {searchQuery}
              </span>
            )}
          </h1>
          <p className="text-text-secondary text-sm mt-1">
            {searchQuery ? `Showing filtered analytics for "${searchQuery}".` : "Deep Business Development Analytics & Volume Pacing."}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Search Bar */}
          <div className="relative z-50">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary pointer-events-none" />
            <input
              type="text"
              placeholder="Search BD, Region, or Brand..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setTimeout(() => setIsFocused(false), 150)}
              className="w-full sm:w-72 pl-9 pr-4 py-2 bg-surface/50 border border-border-subtle rounded-lg text-sm text-white placeholder:text-text-secondary focus:outline-none focus:border-brand-pink-500/50 focus:bg-surface/80 transition-all shadow-[0_0_15px_rgba(218,26,132,0.1)]"
            />
            {suggestions.length > 0 && (
              <div className="absolute top-full mt-2 left-0 w-full sm:w-72 bg-[#16151a] border border-border-subtle rounded-lg shadow-[0_4px_30px_rgba(0,0,0,0.5)] overflow-hidden z-50">
                {suggestions.map(s => (
                  <button
                    key={s}
                    onClick={() => {
                      setSearchQuery(s);
                      setIsFocused(false);
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm text-text-secondary hover:bg-brand-purple-900/40 hover:text-white transition-colors border-b border-border-subtle/50 last:border-0"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* P1-1 — the date pill now WIRES to the app's global date-range filter
              (Filters → Duration): clicking opens the FilterDrawer, whose presets
              (This month / Last month / Last 30 / custom) re-filter the leads this
              view is built from. The label reflects the resulting current window. */}
          <button
            type="button"
            onClick={() => { try { window.dispatchEvent(new CustomEvent('olive:open-filters')); } catch { /* no-op */ } }}
            title="Change the date range — opens Filters → Duration"
            aria-label="Change date range — opens the Filters panel"
            className="flex items-center gap-2 px-3 py-2 sm:py-1.5 bg-brand-purple-900/40 border border-brand-purple-500/30 rounded-lg shrink-0 justify-center cursor-pointer hover:bg-brand-purple-800/60 hover:border-brand-purple-400/50 transition-colors"
          >
            <CalendarDays className="w-4 h-4 text-brand-purple-300" />
            <span className="text-sm font-semibold text-brand-purple-100">
              {rangeMode ? 'Range' : 'MTD'}: {pillLabel || `${currName || "Curr"} 1-${currDay}`}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-brand-purple-300" />
          </button>
          {chartData && chartData.length > 0 && (
            <CsvButton
              base={searchQuery ? `analytics-${searchQuery}` : 'analytics-daily-volume'}
              filters={filters}
              columns={isBrandSearch
                ? [
                    { key: 'day', label: 'Day' },
                    { key: 'spark', label: 'Spark' },
                    { key: 'olive', label: 'Olive' },
                    { key: 'open', label: 'Open Hotels' },
                  ]
                : [
                    { key: 'day', label: 'Day' },
                    { key: 'curr', label: currName },
                    { key: 'prev', label: prevName },
                  ]}
              rows={chartData}
            />
          )}
        </div>
      </header>

      <ExecSummary bullets={summaryBullets} />

      {isEmpty ? (
        <div className="glass-panel p-12 flex flex-col items-center justify-center text-center">
          <Search className="w-8 h-8 text-text-secondary mb-3" />
          <h3 className="text-white font-bold text-lg">No Results Found</h3>
          <p className="text-text-secondary text-sm mt-1">No data matches your search query "{searchQuery}".</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            {renderComparisonCard(isBrandSearch ? `Lead Volume (${searchQuery.toUpperCase()})` : (rangeMode ? "Total Lead Volume (Range)" : "Total Lead Volume (MTD)"), currTotal!, prevTotal!, v => Math.round(v).toLocaleString())}
            {renderComparisonCard(isBrandSearch ? `Active Deals (${searchQuery.toUpperCase()})` : (rangeMode ? "Total Active Deals (Range)" : "Total Active Deals (MTD)"), currActive!, prevActive!, v => Math.round(v).toLocaleString())}

            {/* Zoom Stats Card (Shared between Person and Macro view) */}
            <div className="glass-card p-6 flex flex-col justify-between col-span-1 lg:col-span-2 border-brand-purple-500/30">
              {/* P1-7 — this Zoom/telephony block is a ROLLING 90-DAY window, not
                  MTD like the KPI cards beside it. The window is stated in the
                  title AND a badge + divider so the two are never conflated. */}
              <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  {isPersonSearch ? `${searchQuery}'s Telephony & Zoom` : 'Telephony & Zoom'}
                </h3>
                <span className="text-[9px] font-bold uppercase tracking-widest text-brand-purple-100 bg-brand-purple-500/25 border border-brand-purple-400/50 px-2 py-0.5 rounded-full whitespace-nowrap">
                  Last 90 days
                </span>
              </div>
              <p className="text-[10px] text-text-secondary italic mb-3 border-b border-border-subtle/50 pb-2">Rolling last-90-day Zoom Phone window — a different window from the month-to-date KPIs beside it (no MTD Zoom slice in the feed yet), so don&apos;t read these against the MTD lead counts.</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 flex-1 items-center">
                <div>
                  <p className="text-[10px] text-text-secondary uppercase">Outreach</p>
                  <p className="text-xl font-bold text-white flex items-center gap-1.5 mt-1">
                    <PhoneCall className="w-4 h-4 text-brand-purple-400"/> {zoomStats!.outreach.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-text-secondary uppercase">Connects</p>
                  <p className="text-xl font-bold text-white flex items-center gap-1.5 mt-1">
                    <Users className="w-4 h-4 text-emerald-400"/> {zoomStats!.connects.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-text-secondary uppercase">Recordings</p>
                  <p className="text-xl font-bold text-white flex items-center gap-1.5 mt-1">
                    <PlaySquare className="w-4 h-4 text-brand-pink-400"/> {zoomStats!.recordings.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-text-secondary uppercase">Connect Rate</p>
                  <p className="text-xl font-bold text-white flex items-center gap-1.5 mt-1">
                    <Percent className="w-4 h-4 text-blue-400"/> {zoomStats!.connectRate.toFixed(1)}%
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* DYNAMIC DASHBOARD BIFURCATION */}
          {isPersonSearch ? (
            /* --- PERSON DOSSIER LAYOUT --- */
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              {/* Leaderboard Banner */}
              <div className="glass-panel p-4 mb-6 flex items-center justify-between border-brand-pink-500/20 bg-gradient-to-r from-brand-pink-500/10 to-transparent">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-brand-pink-500/20 flex items-center justify-center border border-brand-pink-500/40">
                    <User className="w-6 h-6 text-brand-pink-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-white">{searchQuery}</h2>
                    <p className="text-xs font-bold uppercase tracking-wider text-brand-pink-400">{personRec?.band}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-1">
                    <Trophy className="w-3 h-3" /> Global Rank
                  </p>
                  <p className="text-2xl font-black text-white">#{globalRank} <span className="text-sm font-normal text-text-secondary">/ {(reportData as any).totalBDs}</span></p>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
                {/* Comparative Radar */}
                <div className="glass-panel p-4 sm:p-6 h-[340px] sm:h-[450px] flex flex-col">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-white mb-6 shrink-0">Personal Skill Signature vs Global Average</h2>
                  <div className="flex-1 w-full relative overflow-y-auto no-scrollbar pr-2">
                    {radarData?.length > 0 ? (
                      <div className="flex flex-col gap-4 pt-1">
                        {radarData?.map((skill: any) => (
                          <div key={skill.subject} className="flex flex-col gap-1.5 group">
                             <div className="flex justify-between items-end">
                                <span className="text-[11px] font-bold text-white uppercase tracking-widest">{skill.subject}</span>
                                <div className="text-[10px] font-bold text-text-secondary flex gap-3">
                                  <span><span className="text-brand-pink-400 text-xs">{skill.Person}</span> (Pers)</span>
                                  <span><span className="text-white text-xs">{skill.Global}</span> (Glob)</span>
                                </div>
                             </div>
                             <div className="relative h-2 w-full bg-surface rounded-full overflow-hidden border border-border-subtle/30 shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]">
                                {/* Global Average Bar (Background grey) */}
                                <div className="absolute top-0 left-0 h-full bg-[#4a4957] rounded-full transition-all duration-1000" style={{ width: `${skill.Global}%` }} />
                                {/* Person Bar (Foreground Pink) */}
                                <div className="absolute top-0 left-0 h-full bg-brand-pink-500 rounded-full transition-all duration-1000 opacity-90 shadow-[0_0_10px_rgba(218,26,132,0.8)]" style={{ width: `${skill.Person}%` }} />
                             </div>
                          </div>
                        ))}
                        <div className="mt-4 flex items-center gap-4 text-[9px] font-bold uppercase tracking-widest text-text-secondary justify-center bg-black/20 py-2 rounded-lg border border-border-subtle/30">
                           <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-sm bg-brand-pink-500 shadow-[0_0_5px_rgba(218,26,132,0.8)]"/> Personal Score</div>
                           <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-sm bg-[#4a4957]"/> Global Avg</div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-full text-text-secondary text-sm">No Q-score data available for this BD.</div>
                    )}
                  </div>
                </div>

                {/* Personal Trendline */}
                <div className="glass-panel p-4 sm:p-6 h-[340px] sm:h-[450px] flex flex-col">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-white mb-6 shrink-0">Personal Growth Pacing</h2>
                  <div className="flex-1 w-full relative">
                    <div className="absolute inset-0" role="img" aria-label="Personal growth pacing: line chart comparing current and previous period daily lead volume.">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#2a2930" vertical={false} />
                          <XAxis dataKey="day" type="category" stroke="#9896a3" tick={{fill: '#9896a3', fontSize: 11}} tickLine={false} axisLine={false} interval={0} minTickGap={0} tickFormatter={(val) => `${val}`} />
                          <YAxis stroke="#9896a3" tick={{fill: '#9896a3', fontSize: 11}} tickLine={false} axisLine={false} />
                          <RechartsTooltip
                            contentStyle={{ backgroundColor: '#16151a', border: '1px solid #2a2930', borderRadius: '8px' }}
                            itemStyle={{ color: '#fff', fontSize: '13px', fontWeight: 600 }}
                            labelStyle={{ color: '#9896a3', fontSize: '11px', marginBottom: '4px' }}
                            formatter={(value: any, name: any) => [value, name === 'curr' ? currName : prevName]}
                            labelFormatter={(label) => `Day ${label}`}
                          />
                          <Legend
                            wrapperStyle={{ fontSize: '12px', color: '#e8e6ef', paddingTop: '20px' }}
                            formatter={(value) => value === 'curr' ? currName : prevName}
                          />
                          <Line type="monotone" dataKey="prev" stroke="#4a4957" strokeWidth={2} dot={false} name="prev" />
                          <Line type="monotone" dataKey="curr" stroke="#da1a84" strokeWidth={3} dot={{ fill: '#da1a84', r: 3, strokeWidth: 0 }} activeDot={{ r: 6 }} name="curr" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </div>

              {/* AI Risk Profile */}
              {personRec?.bd && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="glass-card p-6 border-emerald-500/20 bg-emerald-500/5 flex gap-4">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                      <ShieldCheck className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-2">Core Strength</h3>
                      <p className="text-sm text-white font-medium">{personRec.bd.strength || "Consistent performer with reliable outreach metrics."}</p>
                    </div>
                  </div>
                  <div className="glass-card p-6 border-red-500/20 bg-red-500/5 flex gap-4">
                    <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-5 h-5 text-red-400" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-red-400 mb-2">Identified Risk</h3>
                      <p className="text-sm text-white font-medium">{personRec.bd.risk || "Monitor pacing to ensure end-of-month target is met."}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : isLocationSearch ? (
            /* --- LOCATION DOSSIER LAYOUT --- */
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
               <div className="glass-panel p-4 sm:p-6 mb-6 flex items-center justify-between border-blue-500/20 bg-gradient-to-r from-blue-500/10 to-transparent">
                  <div>
                    <h2 className="text-xl font-black text-white">{searchQuery}</h2>
                    <p className="text-xs font-bold uppercase tracking-wider text-blue-400">Regional Performance Dossier</p>
                  </div>
               </div>

               <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
                 {/* Volume Chart */}
                 <div className="glass-panel p-4 sm:p-6 h-[300px] sm:h-[400px] flex flex-col">
                   <h2 className="text-sm font-semibold uppercase tracking-wider text-white mb-6 shrink-0">Daily Volume Comparison</h2>
                   <div className="flex-1 w-full relative">
                     <div className="absolute inset-0" role="img" aria-label="Daily volume comparison: line chart of current vs previous period daily lead volume for this location.">
                       <ResponsiveContainer width="100%" height="100%">
                         <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                           <CartesianGrid strokeDasharray="3 3" stroke="#2a2930" vertical={false} />
                           <XAxis dataKey="day" type="category" stroke="#9896a3" tick={{fill: '#9896a3', fontSize: 11}} tickLine={false} axisLine={false} interval={0} minTickGap={0} tickFormatter={(val) => `${val}`} />
                           <YAxis stroke="#9896a3" tick={{fill: '#9896a3', fontSize: 11}} tickLine={false} axisLine={false} />
                           <RechartsTooltip
                             contentStyle={{ backgroundColor: '#16151a', border: '1px solid #2a2930', borderRadius: '8px' }}
                             itemStyle={{ color: '#fff', fontSize: '13px', fontWeight: 600 }}
                             labelStyle={{ color: '#9896a3', fontSize: '11px', marginBottom: '4px' }}
                             formatter={(value: any, name: any) => [value, name === 'curr' ? currName : prevName]}
                             labelFormatter={(label) => `Day ${label}`}
                           />
                           <Legend
                             wrapperStyle={{ fontSize: '12px', color: '#e8e6ef', paddingTop: '20px' }}
                             formatter={(value) => value === 'curr' ? currName : prevName}
                           />
                           <Line type="monotone" dataKey="prev" stroke="#4a4957" strokeWidth={2} dot={false} name="prev" />
                           <Line type="monotone" dataKey="curr" stroke="#3b82f6" strokeWidth={3} dot={{ fill: '#3b82f6', r: 3, strokeWidth: 0 }} activeDot={{ r: 6 }} name="curr" />
                         </LineChart>
                       </ResponsiveContainer>
                     </div>
                   </div>
                 </div>

                 {/* Top Local BDs */}
                 <div className="glass-panel p-4 sm:p-6 h-[300px] sm:h-[400px] flex flex-col">
                   <h2 className="text-sm font-semibold uppercase tracking-wider text-white mb-6 shrink-0 flex items-center gap-2">
                     <Trophy className="w-4 h-4 text-emerald-400" />
                     Top Local Performers
                   </h2>
                   <div className="flex-1 overflow-y-auto no-scrollbar flex flex-col gap-3">
                      {localLeaderboard!.length === 0 && (
                        <div className="text-sm text-text-secondary">No BDs found in this region.</div>
                      )}
                      {localLeaderboard!.map((bd: any, i: number) => (
                        <div key={bd.owner} className="flex items-center justify-between p-4 bg-surface/40 rounded-lg border border-border-subtle hover:border-emerald-500/30 transition-colors">
                           <div className="flex items-center gap-4">
                              <span className="text-xl font-black text-text-secondary w-4 text-right">#{i+1}</span>
                              <div>
                                <p className="text-sm font-bold text-white">{bd.owner}</p>
                                <p className="text-[10px] text-text-secondary uppercase">{bd.band || 'Pending'}</p>
                              </div>
                           </div>
                           <div className="text-right">
                              <p className="text-sm font-bold text-emerald-400">{bd.active.toFixed(0)}% Act</p>
                              <p className="text-[10px] text-text-secondary uppercase">Score: {Math.round(bd.bps?.score || 0)}</p>
                           </div>
                        </div>
                      ))}
                   </div>
                 </div>
               </div>

               <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
                 {/* Lead Status Pipeline */}
                 <div className="glass-panel p-4 sm:p-6 flex flex-col">
                   <h2 className="text-sm font-semibold uppercase tracking-wider text-white mb-6 shrink-0">Pipeline Funnel</h2>

                   {/* Unified Multi-Segment Bar */}
                   <div className="w-full h-8 flex rounded-xl overflow-hidden mb-6 bg-surface">
                      {statusCounts!.map((status: any) => {
                        const pct = (status.value / currTotal!) * 100;
                        let color = 'bg-gray-500';
                        if (status.name === 'Discovery') color = 'bg-blue-500';
                        else if (status.name === 'Engagement') color = 'bg-purple-500';
                        else if (status.name === 'High Intent') color = 'bg-brand-pink-500';
                        else if (status.name === 'Won') color = 'bg-emerald-500';
                        else if (status.name === 'Lost') color = 'bg-red-500/50';

                        return (
                          <div
                            key={status.name}
                            style={{ width: `${pct}%` }}
                            className={clsx("h-full transition-all duration-500 border-r border-black/20 last:border-0", color)}
                            title={`${status.name}: ${status.value} (${pct.toFixed(1)}%)`}
                          />
                        );
                      })}
                   </div>

                   {/* Legend */}
                   <div className="grid grid-cols-2 gap-3">
                     {statusCounts!.map((status: any) => {
                       const pct = (status.value / currTotal!) * 100;
                       let dotColor = 'bg-gray-500';
                       if (status.name === 'Discovery') dotColor = 'bg-blue-500';
                       else if (status.name === 'Engagement') dotColor = 'bg-purple-500';
                       else if (status.name === 'High Intent') dotColor = 'bg-brand-pink-500';
                       else if (status.name === 'Won') dotColor = 'bg-emerald-500';
                       else if (status.name === 'Lost') dotColor = 'bg-red-500/50';

                       return (
                         <div key={status.name} className="flex items-center justify-between bg-surface/30 px-3 py-2 rounded-lg">
                           <div className="flex items-center gap-2">
                             <div className={clsx("w-2.5 h-2.5 rounded-full", dotColor)} />
                             <span className="text-xs text-white font-medium">{status.name}</span>
                           </div>
                           <span className="text-xs font-bold text-text-secondary">{pct.toFixed(0)}%</span>
                         </div>
                       );
                     })}
                   </div>
                 </div>

                 {/* Brand Distribution */}
                 <div className="glass-panel p-4 sm:p-6 flex flex-col">
                   <h2 className="text-sm font-semibold uppercase tracking-wider text-white mb-6 shrink-0">Brand Distribution</h2>
                   <div className="flex flex-col gap-4">
                     {brandCounts!.map((brand: any) => {
                       const pct = (brand.value / currTotal!) * 100;
                       let color = 'bg-brand-purple-500';
                       if (brand.name.toLowerCase() === 'spark') color = 'bg-brand-pink-500';
                       if (brand.name.toLowerCase() === 'open hotels') color = 'bg-emerald-500';

                       return (
                         <div key={brand.name} className="flex flex-col gap-1.5">
                           <div className="flex justify-between text-xs font-bold">
                             <span className="text-white">{brand.name}</span>
                             <span className="text-white">{brand.value} <span className="text-text-secondary font-normal ml-1">({pct.toFixed(1)}%)</span></span>
                           </div>
                           <div className="h-2 w-full bg-surface rounded-full overflow-hidden">
                             <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
                           </div>
                         </div>
                       );
                     })}
                   </div>
                 </div>
               </div>
            </div>
          ) : (
            /* --- MACRO (GLOBAL/BRAND) DASHBOARD LAYOUT --- */
            <div className="animate-in fade-in duration-500">
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
                <div className="glass-panel p-4 sm:p-6 h-[300px] sm:h-[400px] flex flex-col xl:col-span-2">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-white mb-6 shrink-0">
                    {isBrandSearch ? "Brand Performance Comparison (MTD)" : "Daily Volume Comparison"}
                  </h2>
                  <div className="flex-1 w-full relative">
                    <div className="absolute inset-0" role="img" aria-label={isBrandSearch ? 'Brand performance comparison: line chart of daily lead volume by brand this month.' : 'Daily volume comparison: line chart of current vs previous period daily lead volume.'}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#2a2930" vertical={false} />
                          <XAxis dataKey="day" type="category" stroke="#9896a3" tick={{fill: '#9896a3', fontSize: 11}} tickLine={false} axisLine={false} interval={0} minTickGap={0} tickFormatter={(val) => `${val}`} />
                          <YAxis stroke="#9896a3" tick={{fill: '#9896a3', fontSize: 11}} tickLine={false} axisLine={false} />

                          {isBrandSearch ? (
                            <>
                              <RechartsTooltip
                                contentStyle={{ backgroundColor: '#16151a', border: '1px solid #2a2930', borderRadius: '8px' }}
                                itemStyle={{ fontSize: '13px', fontWeight: 600 }}
                                labelStyle={{ color: '#9896a3', fontSize: '11px', marginBottom: '4px' }}
                                labelFormatter={(label) => `Day ${label} (${currName})`}
                              />
                              <Legend wrapperStyle={{ fontSize: '12px', color: '#e8e6ef', paddingTop: '20px' }} />
                              <Line type="monotone" dataKey="spark" stroke="#da1a84" strokeWidth={3} dot={false} activeDot={{ r: 6 }} name="Spark" />
                              <Line type="monotone" dataKey="olive" stroke="#502875" strokeWidth={3} dot={false} activeDot={{ r: 6 }} name="Olive" />
                              <Line type="monotone" dataKey="open" stroke="#10b981" strokeWidth={3} dot={false} activeDot={{ r: 6 }} name="Open Hotels" />
                            </>
                          ) : (
                            <>
                              <RechartsTooltip
                                contentStyle={{ backgroundColor: '#16151a', border: '1px solid #2a2930', borderRadius: '8px' }}
                                itemStyle={{ color: '#fff', fontSize: '13px', fontWeight: 600 }}
                                labelStyle={{ color: '#9896a3', fontSize: '11px', marginBottom: '4px' }}
                                formatter={(value: any, name: any) => [value, name === 'curr' ? currName : prevName]}
                                labelFormatter={(label) => `Day ${label}`}
                              />
                              <Legend
                                wrapperStyle={{ fontSize: '12px', color: '#e8e6ef', paddingTop: '20px' }}
                                formatter={(value) => value === 'curr' ? currName : prevName}
                              />
                              <Line type="monotone" dataKey="prev" stroke="#4a4957" strokeWidth={2} dot={false} name="prev" />
                              <Line type="monotone" dataKey="curr" stroke="#da1a84" strokeWidth={3} dot={{ fill: '#da1a84', r: 3, strokeWidth: 0 }} activeDot={{ r: 6 }} name="curr" />
                            </>
                          )}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                <div className="glass-panel p-4 sm:p-6 h-[300px] sm:h-[400px] flex flex-col xl:col-span-1">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-white mb-6 shrink-0">
                    {isLocationSearch ? `Performance Bands (${searchQuery})` : 'Performance Bands'}
                  </h2>
                  <div className="flex-1 w-full relative">
                    <div className="absolute inset-0 overflow-y-auto no-scrollbar flex flex-col justify-center">
                      {bandData!.length > 0 ? (
                        <div className="flex flex-col gap-6">
                          {(() => {
                            const totalBDs = bandData!.reduce((acc: number, b: any) => acc + b.value, 0);
                            return bandData!.map((band: any) => {
                              const pct = totalBDs > 0 ? (band.value / totalBDs) * 100 : 0;
                              return (
                                <div key={band.name} className="flex flex-col gap-2.5">
                                  <div className="flex justify-between items-end">
                                    <div className="flex items-center gap-2">
                                      <div className="w-2.5 h-2.5 rounded-full shadow-[0_0_8px_currentColor]" style={{ backgroundColor: band.color, color: band.color }} />
                                      <span className="text-sm font-bold text-white">{band.name}</span>
                                    </div>
                                    <span className="text-sm font-semibold text-text-secondary">{band.value} Reps <span className="text-[10px] uppercase ml-1 opacity-70">({pct.toFixed(0)}%)</span></span>
                                  </div>
                                  <div className="h-2 w-full bg-surface/80 rounded-full overflow-hidden border border-border-subtle/30">
                                    <div
                                      className="h-full rounded-full transition-all duration-1000 relative"
                                      style={{ width: `${pct}%`, backgroundColor: band.color }}
                                    >
                                      <div className="absolute inset-0 bg-gradient-to-r from-transparent to-white/20" />
                                    </div>
                                  </div>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      ) : (
                        <div className="flex items-center justify-center h-full text-text-secondary text-sm">No band data available</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
                <div className="glass-panel p-4 sm:p-6 h-[340px] sm:h-[450px] flex flex-col">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-white mb-6 shrink-0">
                    {isLocationSearch ? `Regional Skill Matrix (${searchQuery})` : 'Team Skill Matrix'}
                  </h2>
                  <div className="flex-1 w-full relative overflow-y-auto no-scrollbar pr-2">
                    {radarData!.length > 0 ? (
                      <div className="flex flex-col gap-4 pt-1">
                        {radarData!.map((skill: any) => (
                          <div key={skill.subject} className="flex flex-col gap-1.5 group">
                             <div className="flex justify-between items-end">
                                <span className="text-[11px] font-bold text-white uppercase tracking-widest">{skill.subject}</span>
                                <span className="text-xs font-bold text-brand-pink-400">{skill.A}</span>
                             </div>
                             <div className="relative h-2 w-full bg-surface rounded-full overflow-hidden border border-border-subtle/30 shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]">
                                <div className="absolute top-0 left-0 h-full bg-brand-pink-500 rounded-full transition-all duration-1000 shadow-[0_0_10px_rgba(218,26,132,0.8)]" style={{ width: `${skill.A}%` }} />
                             </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-full text-text-secondary text-sm">No skill data available</div>
                    )}
                  </div>
                </div>

                <div className="glass-panel p-4 sm:p-6 h-[340px] sm:h-[450px] flex flex-col">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-white mb-6 shrink-0">
                    {isLocationSearch ? `Lead Efficiency Matrix (${searchQuery})` : 'Lead Efficiency Matrix'}
                  </h2>
                  <div className="flex-1 w-full relative">
                    <div className="absolute inset-0" role="img" aria-label="Lead efficiency matrix: scatter plot where each point is a BD positioned by total leads and active leads, sized by active percentage.">
                      {(reportData as any).scatterData!.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#2a2930" />
                            <XAxis
                              type="number"
                              dataKey="leads"
                              name="Leads"
                              tick={{ fill: '#9896a3', fontSize: 11 }}
                              stroke="#9896a3"
                            />
                            <YAxis
                              type="number"
                              dataKey="active"
                              name="Active leads"
                              tick={{ fill: '#9896a3', fontSize: 11 }}
                              stroke="#9896a3"
                            />
                            <ZAxis type="number" dataKey="activeRate" range={[50, 300]} name="Active %" />
                            <RechartsTooltip
                              cursor={{ strokeDasharray: '3 3' }}
                              contentStyle={{ backgroundColor: '#16151a', border: '1px solid #2a2930', borderRadius: '8px' }}
                              itemStyle={{ fontSize: '13px', fontWeight: 600 }}
                              formatter={(value: any, name: any) => [name === 'Active %' ? `${value}%` : Number(value).toLocaleString('en-IN'), name]}
                            />
                            <Scatter name="BDs" data={(reportData as any).scatterData} fill="#10b981" fillOpacity={0.7} />
                          </ScatterChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex items-center justify-center h-full text-text-secondary text-sm">No efficiency data available</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
