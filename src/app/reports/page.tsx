'use client';

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  Table2, RotateCcw, AlertTriangle, Info, FileSpreadsheet, FileText, Loader2, ArrowDownUp,
  SlidersHorizontal, ChevronDown, IndianRupee, Building2, MapPin, Layers, Target, CalendarRange,
  Users, Wallet, Download, X,
} from 'lucide-react';
import { useDashboard } from '@/lib/DashboardContext';
import { buildDatePresets, latestLeadDate, activePreset } from '@/lib/datePresets';
import { CollapsibleSection, MultiSelectField } from '@/components/FilterControls';
import { InfoNote } from '@/components/MobileStatCard';
import {
  FieldList, Zone, ZoneAddMenu, PivotTableView, ReportChart, ZONE_META, type DragPayload,
} from '@/components/PivotBuilder';
import {
  DATASETS, DIM_LABEL, TEMPLATES, DEFAULT_TEMPLATE_ID, templateById, buildChartModel,
  computePivot, datasetById, defaultAgg, emptyReportFilters, fieldByKey, filterOptions,
  formatValue, reportFilename, selectRows, seedFromGlobal, valueLabel, buildFilterSummary,
  exportPivotCsv, exportRawCsv, exportExcel, exportPdf, expandRow, PDF_ROW_CAP,
  type AggId, type PivotConfig, type ReportDatasetId, type ReportDimKey, type ReportFilterState,
  type ReportTemplate, type ValueSpec, type ZoneId,
} from '@/lib/reportEngine';

/* ==================================================================
 * /reports — Report Builder.
 *
 * Designed for someone opening it for the FIRST time, with no training and no
 * idea what a pivot table is. The shape of the page is the whole design:
 *
 *   1. Pick a question   — plain-English cards. One click = a finished report.
 *   2. Your report       — chart + table + grand totals, populated on arrival.
 *   3. What is counted   — one sentence explaining the numbers.
 *   4. Download          — Excel / CSV / PDF, filters always included.
 *   5. Customise         — the full pivot builder, folded away until asked for.
 *
 * NOTHING was removed to achieve that: drag AND click assignment, every
 * aggregation, the filter set, the cardinality guard, the Rs Lakh/Crore
 * formatting and the deals date rule all still live here. Only the language
 * and the order changed.
 *
 * Filter state stays INDEPENDENT of the dashboard's global filters but is
 * seeded from them once, so arriving here feels continuous.
 * ================================================================== */

/** Which filter dimension a pivot field maps onto (for the "Narrow it down" zone). */
function dimForField(dsId: ReportDatasetId, key: string): ReportDimKey | null {
  const direct: Record<string, ReportDimKey> = {
    brand: 'brand', status: 'status', stage: 'stage', owner: 'owner', source: 'source',
    region: 'region', state: 'state', city: 'city', cluster: 'cluster',
  };
  if (dsId === 'bd' && key === 'bd') return 'owner';
  return direct[key] ?? null;
}

let valueSeq = 0;
const nextValueId = () => `v${Date.now().toString(36)}${(valueSeq++).toString(36)}`;

/** A picture for each question card. */
const TEMPLATE_ICON: Record<string, typeof Table2> = {
  'money-by-bd': IndianRupee,
  'hotels-by-bd': Building2,
  'leads-by-source': Layers,
  'collected-by-brand': Wallet,
  'signings-by-month': CalendarRange,
  'pipeline-by-stage': Table2,
  'money-by-bd-brand': Users,
  'leads-by-region-brand': MapPin,
  'bd-vs-target': Target,
};

/** Concise titles for the narrow mobile report header (the full question stays
 *  visible as a subtitle). Keyed by template id; missing ids fall back to the
 *  full label. Kept here (not in reportEngine) so the data engine is untouched. */
const TEMPLATE_SHORT: Record<string, string> = {
  'money-by-bd': 'TA fee by BD',
  'hotels-by-bd': 'Hotels by BD',
  'leads-by-source': 'Leads by source',
  'collected-by-brand': 'Collected by brand',
  'signings-by-month': 'Signings by month',
  'pipeline-by-stage': 'Pipeline by stage',
  'money-by-bd-brand': 'TA fee by BD & brand',
  'leads-by-region-brand': 'Leads by region',
  'bd-vs-target': 'BD vs target',
};

/**
 * Clone a template's layout. `keepIds` is used for the FIRST render only: the
 * ids must be identical on the server and on the client, so the landing report
 * reuses the template's static ids instead of minting time-based ones.
 */
const cloneConfig = (t: ReportTemplate, keepIds: boolean): PivotConfig => ({
  rows: [...t.config.rows],
  cols: [...t.config.cols],
  values: t.config.values.map((v) => ({ ...v, id: keepIds ? v.id : nextValueId() })),
});

const DEFAULT_TPL = templateById(DEFAULT_TEMPLATE_ID) as ReportTemplate;

export default function ReportsPage() {
  const { data, filters, leadsAsOf, isLoading, error } = useDashboard();

  const [dsId, setDsId] = useState<ReportDatasetId>(DEFAULT_TPL.dataset);
  const [rf, setRf] = useState<ReportFilterState>(emptyReportFilters);
  const [cfg, setCfg] = useState<PivotConfig>(() => cloneConfig(DEFAULT_TPL, true));
  const [tplId, setTplId] = useState<string | null>(DEFAULT_TPL.id);
  const [sortByTotal, setSortByTotal] = useState(DEFAULT_TPL.sortByTotal !== false);
  const [advanced, setAdvanced] = useState(false);
  /** Download the individual records instead of the report as shown. */
  const [rawInstead, setRawInstead] = useState(false);
  /** Add the individual records as an extra sheet in the Excel file. */
  const [rawSheet, setRawSheet] = useState(false);
  const [busy, setBusy] = useState<'csv' | 'excel' | 'pdf' | null>(null);
  const [filterZone, setFilterZone] = useState<ReportDimKey[]>([]);
  const [openDim, setOpenDim] = useState<ReportDimKey | null>(null);
  const [seeded, setSeeded] = useState(false);
  const [notice, setNotice] = useState('');

  const def = useMemo(() => datasetById(dsId), [dsId]);
  const mode: 'pivot' | 'raw' = rawInstead ? 'raw' : 'pivot';

  // Seed ONCE from the live global filters (the two stay independent afterwards).
  // Derived-state-during-render rather than an effect: React re-renders straight
  // away without committing the first pass, so there is no cascading-render hop
  // and no flash of the unseeded filter set.
  if (!seeded && data) {
    setSeeded(true);
    setRf(seedFromGlobal(filters));
  }

  const presets = useMemo(() => buildDatePresets(latestLeadDate(data?.leads)), [data]);
  const activePresetLabel = activePreset(presets, rf.presetLabel, rf.from, rf.to);
  const options = useMemo(() => filterOptions(data, dsId), [data, dsId]);

  const rows = useMemo(() => selectRows(data, dsId, rf), [data, dsId, rf]);
  const result = useMemo(() => computePivot(rows, def, cfg, sortByTotal), [rows, def, cfg, sortByTotal]);
  const matrix = result.matrix;
  const chart = useMemo(() => buildChartModel(result, cfg, def, sortByTotal), [result, cfg, def, sortByTotal]);

  const asOf = (data as any)?.deals?.generated || leadsAsOf || (data as any)?.generated || '—';
  const activeTpl = templateById(tplId);
  const reportTitle = activeTpl ? activeTpl.label : 'Your custom report';
  // Concise title for the narrow mobile report header; the full question stays
  // visible as a subtitle so nothing is lost. Custom reports have no short form.
  const reportTitleShort = (activeTpl && TEMPLATE_SHORT[activeTpl.id]) || reportTitle;

  /** Any hand edit means this is no longer one of the ready-made reports. */
  const markCustom = () => setTplId(null);

  /* ---------------- zone plumbing ---------------- */

  const switchDataset = (next: ReportDatasetId) => {
    setDsId(next);
    setCfg(datasetById(next).defaults);
    setFilterZone([]);
    setOpenDim(null);
    setNotice('');
    markCustom();
  };

  const addToZone = (zone: ZoneId, key: string, atIndex?: number) => {
    setNotice('');
    markCustom();
    if (zone === 'filters') {
      const dim = dimForField(dsId, key);
      if (!dim || !def.dims.includes(dim)) {
        setNotice(`${fieldByKey(def, key)?.label || key} cannot be used to narrow down ${def.label}.`);
        return;
      }
      setFilterZone((prev) => (prev.includes(dim) ? prev : [...prev, dim]));
      setOpenDim(dim);
      return;
    }
    if (zone === 'values') {
      const field = fieldByKey(def, key);
      const spec: ValueSpec = { id: nextValueId(), field: key, agg: defaultAgg(field), label: '' };
      setCfg((c) => {
        const next = [...c.values];
        next.splice(atIndex ?? next.length, 0, spec);
        return { ...c, values: next };
      });
      return;
    }
    if (key === '__records') {
      setNotice('“Records” is a number, not a category — put it under “Show me”.');
      return;
    }
    setCfg((c) => {
      const other: 'rows' | 'cols' = zone === 'rows' ? 'cols' : 'rows';
      const axis = c[zone].filter((k) => k !== key);
      axis.splice(Math.min(atIndex ?? axis.length, axis.length), 0, key);
      return { ...c, [zone]: axis, [other]: c[other].filter((k) => k !== key) } as PivotConfig;
    });
  };

  const removeFromZone = (zone: ZoneId, index: number) => {
    markCustom();
    if (zone === 'filters') {
      const dim = filterZone[index];
      setFilterZone((prev) => prev.filter((_, i) => i !== index));
      if (dim) setRf((prev) => ({ ...prev, [dim]: new Set() }) as ReportFilterState);
      return;
    }
    if (zone === 'values') {
      setCfg((c) => ({ ...c, values: c.values.filter((_, i) => i !== index) }));
      return;
    }
    setCfg((c) => ({ ...c, [zone]: c[zone].filter((_, i) => i !== index) }) as PivotConfig);
  };

  const moveWithin = (zone: ZoneId, index: number, dir: -1 | 1) => {
    markCustom();
    const to = index + dir;
    const reorder = <T,>(arr: T[]): T[] => {
      if (to < 0 || to >= arr.length) return arr;
      const next = [...arr];
      const [it] = next.splice(index, 1);
      next.splice(to, 0, it);
      return next;
    };
    if (zone === 'filters') {
      setFilterZone((prev) => reorder(prev));
      return;
    }
    if (zone === 'values') {
      setCfg((c) => ({ ...c, values: reorder(c.values) }));
      return;
    }
    setCfg((c) => ({ ...c, [zone]: reorder(c[zone]) }) as PivotConfig);
  };

  /** Drag-reorder inside one zone: lift item `from` and drop it at `to`. */
  const reorderZone = (zone: ZoneId, from: number, to: number) => {
    markCustom();
    const shift = <T,>(arr: T[]): T[] => {
      if (from === to || from < 0 || from >= arr.length) return arr;
      const next = [...arr];
      const [it] = next.splice(from, 1);
      next.splice(Math.max(0, Math.min(to, next.length)), 0, it);
      return next;
    };
    if (zone === 'filters') setFilterZone((prev) => shift(prev));
    else if (zone === 'values') setCfg((c) => ({ ...c, values: shift(c.values) }));
    else setCfg((c) => ({ ...c, [zone]: shift(c[zone]) }) as PivotConfig);
  };

  const handleDrop = (zone: ZoneId) => (p: DragPayload, toIndex: number) => {
    if (p.from === zone) {
      reorderZone(zone, p.index, toIndex);
      return;
    }
    if (p.from !== 'available') removeFromZone(p.from, p.index);
    addToZone(zone, p.key, toIndex);
  };

  const usage = useMemo(() => {
    const u: Record<string, ZoneId[]> = {};
    const add = (k: string, z: ZoneId) => {
      u[k] = [...(u[k] || []), z];
    };
    cfg.rows.forEach((k) => add(k, 'rows'));
    cfg.cols.forEach((k) => add(k, 'cols'));
    cfg.values.forEach((v) => add(v.field, 'values'));
    return u;
  }, [cfg]);

  const zoneItems = (zone: ZoneId) => {
    if (zone === 'values') {
      return cfg.values.map((spec) => ({
        key: spec.field,
        label: valueLabel(spec, fieldByKey(def, spec.field)),
        spec,
      }));
    }
    if (zone === 'filters') {
      const dims = Array.from(new Set([...filterZone, ...def.dims.filter((d) => (rf[d] as Set<string>).size > 0)]));
      return dims.map((d) => ({
        key: d,
        label: DIM_LABEL[d],
        badge: (rf[d] as Set<string>).size ? `${(rf[d] as Set<string>).size} selected` : 'all',
      }));
    }
    return cfg[zone].map((k) => ({ key: k, label: fieldByKey(def, k)?.label || k }));
  };

  /* ---------------- filters ---------------- */

  const toggleDim = (key: ReportDimKey, value: string) => {
    markCustom();
    setRf((prev) => {
      const next = { ...prev, [key]: new Set(prev[key]) } as ReportFilterState;
      const s = next[key] as Set<string>;
      if (s.has(value)) s.delete(value);
      else s.add(value);
      return next;
    });
  };

  const clearDim = (key: ReportDimKey) => {
    markCustom();
    setRf((prev) => ({ ...prev, [key]: new Set() }) as ReportFilterState);
  };

  const setRange = (from: string, to: string, presetLabel = '') => {
    markCustom();
    setRf((prev) => ({ ...prev, from, to, presetLabel }));
  };

  const resetAll = () => {
    setDsId(DEFAULT_TPL.dataset);
    setCfg(cloneConfig(DEFAULT_TPL, false));
    setRf(emptyReportFilters());
    setTplId(DEFAULT_TPL.id);
    setSortByTotal(DEFAULT_TPL.sortByTotal !== false);
    setFilterZone([]);
    setOpenDim(null);
    setNotice('');
  };

  const applyTemplate = (id: string) => {
    const t = templateById(id);
    if (!t) return;
    const fyStart: string = (data as any)?.deals?.fees?.fy?.fyStart || '';
    const latest = latestLeadDate(data?.leads);
    setDsId(t.dataset);
    setCfg(cloneConfig(t, false));
    const base = emptyReportFilters();
    setRf(t.filters ? t.filters(base, { fyStart, latest }) : base);
    setSortByTotal(t.sortByTotal !== false);
    setTplId(t.id);
    setFilterZone([]);
    setOpenDim(null);
    setNotice('');
  };

  /* ---------------- exports ---------------- */

  const filterSummary = useMemo(
    () =>
      buildFilterSummary({
        def, rf, cfg, result, rawRowCount: rows.length, asOf: String(asOf),
        presetLabel: activePresetLabel, kind: mode,
      }),
    [def, rf, cfg, result, rows.length, asOf, activePresetLabel, mode]
  );

  const canExport = mode === 'pivot' ? !!matrix && rows.length > 0 : rows.length > 0;

  const doCsv = () => {
    if (!canExport) return;
    setBusy('csv');
    try {
      if (mode === 'pivot' && matrix) exportPivotCsv(matrix, reportFilename(dsId, rf, def, 'csv', 'pivot'));
      else exportRawCsv(def.columns, rows, reportFilename(dsId, rf, def, 'csv', 'raw'));
    } catch (e) {
      console.error('CSV export failed', e);
    } finally {
      setBusy(null);
    }
  };

  const doExcel = async () => {
    if (!canExport) return;
    setBusy('excel');
    try {
      await exportExcel({
        filename: reportFilename(dsId, rf, def, 'xlsx', mode),
        filterSummary,
        matrix: mode === 'pivot' ? matrix : null,
        sheetName: def.label,
        raw: mode === 'raw' || rawSheet ? { columns: def.columns, rows } : null,
      });
    } catch (e) {
      console.error('Excel export failed', e);
    } finally {
      setBusy(null);
    }
  };

  const doPdf = async () => {
    if (!canExport) return;
    setBusy('pdf');
    try {
      const head: string[][] =
        mode === 'pivot' && matrix
          ? matrix.header.map((r) => expandRow(r, matrix.colCount))
          : [def.columns.map((c) => c.label)];
      const body: string[][] =
        mode === 'pivot' && matrix
          ? matrix.body.map((r) => expandRow(r, matrix.colCount))
          : rows.slice(0, PDF_ROW_CAP).map((r) =>
              def.columns.map((c) => {
                const v = c.format ? c.format(r) : (r as any)?.[c.key];
                return v == null ? '' : String(v);
              })
            );
      await exportPdf({
        filename: reportFilename(dsId, rf, def, 'pdf', mode),
        title: reportTitle,
        subtitle: `Olive Hospitality — Report Builder`,
        filterSummary,
        head,
        body,
        cappedFrom: mode === 'raw' && rows.length > PDF_ROW_CAP ? rows.length : 0,
      });
    } catch (e) {
      console.error('PDF export failed', e);
    } finally {
      setBusy(null);
    }
  };

  /* ---------------- readable descriptions ---------------- */

  /** "TA fee contracted, for each BD, split by Brand" — no pivot vocabulary. */
  const plainCaption = useMemo(() => {
    const vals = cfg.values.map((v) => valueLabel(v, fieldByKey(def, v.field))).join(' and ');
    const by = cfg.rows.map((k) => fieldByKey(def, k)?.label || k).join(', then ');
    const across = cfg.cols.map((k) => fieldByKey(def, k)?.label || k).join(', then ');
    const parts: string[] = [vals || 'Nothing chosen yet'];
    if (by) parts.push(`for each ${by}`);
    if (across) parts.push(`split by ${across}`);
    return parts.join(', ');
  }, [cfg, def]);

  /** The active filters, as chips a human can read — and clear with one click. */
  const chips: { id: string; label: string; clear: () => void }[] = [];
  if (def.dateDim && (rf.from || rf.to)) {
    const when = activePresetLabel || `${rf.from || 'start'} to ${rf.to || 'today'}`;
    chips.push({ id: 'date', label: `${def.dateLabel}: ${when}`, clear: () => setRange('', '', '') });
  }
  def.dims.forEach((d) => {
    const sel = rf[d] as Set<string>;
    if (sel.size) {
      chips.push({ id: d, label: `${DIM_LABEL[d]}: ${Array.from(sel).join(', ')}`, clear: () => clearDim(d) });
    }
  });

  /** Grand totals, paired with the value they belong to. */
  const headline = useMemo(() => {
    const specs = cfg.values
      .map((spec) => ({ spec, field: fieldByKey(def, spec.field) }))
      .filter((x) => !!x.field);
    return specs.map((x, i) => {
      const v = result.grandTotals[i] ?? null;
      const exact =
        typeof v === 'number' && Number.isFinite(v)
          ? `${x.field!.format === 'inr' ? '₹' : ''}${Math.round(v).toLocaleString('en-IN')}`
          : '';
      return {
        key: x.spec.id,
        label: valueLabel(x.spec, x.field),
        text: formatValue(v, x.spec.agg, x.field!),
        exact,
      };
    });
  }, [cfg, def, result]);

  const noun = def.summaryOnly ? 'summary row' : dsId === 'leads' ? 'lead' : dsId === 'bd' ? 'BD' : 'deal';

  if (error) {
    return (
      <div className="glass-panel p-6 text-center">
        <p className="text-sm font-semibold text-white">Report Builder unavailable</p>
        <p className="text-[12px] text-text-secondary mt-1">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 sm:gap-5 min-w-0">
      {/* ---------------------------------------------------------------- */}
      {/* Header                                                            */}
      {/* ---------------------------------------------------------------- */}
      <header className="flex flex-col gap-1 min-w-0">
        <h1 className="text-2xl sm:text-3xl font-bold text-white flex items-center gap-2.5 min-w-0">
          <Table2 className="w-6 h-6 text-brand-pink-400 shrink-0" aria-hidden="true" />
          <span className="truncate">Report Builder</span>
        </h1>
        <p className="text-[13px] text-text-secondary max-w-3xl">
          Pick a question below and you get a finished report — a chart, a table and a download. No setup needed.
          Want something else? Open <strong className="text-white/80">Customise</strong> at the bottom.
        </p>
      </header>

      {/* ---------------------------------------------------------------- */}
      {/* 1 · Pick a question                                               */}
      {/* ---------------------------------------------------------------- */}
      <section aria-labelledby="q-h" className="glass-panel p-3 sm:p-4 flex flex-col gap-3 min-w-0">
        <div className="flex flex-col gap-0.5">
          <h2 id="q-h" className="text-sm font-bold text-white">
            1 · What do you want to know?
          </h2>
          <p className="text-[11px] text-text-secondary">
            Click any question. The report below updates straight away.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2.5 min-w-0">
          {TEMPLATES.map((t) => {
            const on = t.id === tplId;
            const Icon = TEMPLATE_ICON[t.id] || Table2;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => applyTemplate(t.id)}
                aria-pressed={on}
                className={clsx(
                  'group flex items-start gap-2.5 p-3 min-h-[76px] rounded-xl border text-left transition-all cursor-pointer min-w-0',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-400 focus-visible:ring-offset-1 focus-visible:ring-offset-panel active:scale-[0.99]',
                  on
                    ? 'bg-brand-pink-500/15 border-brand-pink-500/70 shadow-[0_0_16px_rgba(218,26,132,0.28)]'
                    : 'bg-surface border-border-subtle hover:border-brand-pink-500/50 hover:bg-brand-pink-500/[0.07]'
                )}
              >
                <span
                  className={clsx(
                    'shrink-0 w-9 h-9 rounded-lg flex items-center justify-center border transition-colors',
                    on
                      ? 'bg-brand-pink-500/25 border-brand-pink-500/60'
                      : 'bg-black/30 border-border-subtle group-hover:border-brand-pink-500/40'
                  )}
                >
                  <Icon className={clsx('w-4 h-4', on ? 'text-brand-pink-300' : 'text-brand-purple-300')} aria-hidden="true" />
                </span>
                <span className="flex flex-col gap-0.5 min-w-0">
                  <span className={clsx('text-[13px] font-bold leading-snug', on ? 'text-white' : 'text-white/90')}>
                    {t.label}
                  </span>
                  <span className="text-[11px] text-text-secondary leading-snug">{t.blurb}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 2 · The report                                                    */}
      {/* ---------------------------------------------------------------- */}
      <section aria-labelledby="res-h" className="glass-panel p-3 sm:p-4 flex flex-col gap-3.5 min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 min-w-0">
          <div className="flex flex-col gap-0.5 min-w-0">
            <h2 id="res-h" title={reportTitle} className="text-sm font-bold text-white leading-snug break-words">
              <span className="md:hidden">2 · {reportTitleShort}</span>
              <span className="hidden md:inline">2 · {reportTitle}</span>
            </h2>
            {activeTpl && reportTitleShort !== reportTitle && (
              <p className="md:hidden text-[11px] text-text-secondary/80 break-words leading-snug">{reportTitle}</p>
            )}
            <p className="text-[11px] text-text-secondary break-words">{plainCaption}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setSortByTotal((s) => !s);
              markCustom();
            }}
            aria-pressed={sortByTotal}
            className="flex items-center gap-1.5 px-2.5 min-h-[36px] rounded-lg border border-border-subtle bg-surface text-[10px] font-bold uppercase tracking-wider text-text-secondary hover:text-white hover:border-brand-pink-500/50 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-400 shrink-0"
          >
            <ArrowDownUp className="w-3 h-3" aria-hidden="true" />
            {sortByTotal ? 'Biggest first' : 'A to Z'}
          </button>
        </div>

        {/* Row count + the filters actually in force, as readable chips. */}
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span
            aria-live="polite"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-black/30 border border-border-subtle text-[11px] text-white"
          >
            <strong className="text-brand-pink-300 tabular-nums">{rows.length.toLocaleString('en-IN')}</strong>
            {noun}
            {rows.length === 1 ? '' : 's'} included
          </span>
          {chips.length === 0 ? (
            <span className="text-[11px] text-text-secondary">No filters — this is everything.</span>
          ) : (
            chips.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={c.clear}
                aria-label={`Remove filter ${c.label}`}
                title={`Remove filter ${c.label}`}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-brand-purple-900/40 border border-brand-purple-500/40 text-[11px] text-white hover:bg-brand-purple-800/60 transition-colors cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-400 focus-visible:ring-offset-1 focus-visible:ring-offset-panel max-w-full"
              >
                <span className="truncate">{c.label}</span>
                <X className="w-3 h-3 shrink-0 text-text-secondary group-hover:text-brand-pink-400" aria-hidden="true" />
              </button>
            ))
          )}
        </div>

        {/* Grand totals, big enough to read from across the desk. */}
        {matrix && headline.length > 0 && rows.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 min-w-0">
            {headline.map((h) => (
              <div key={h.key} className="rounded-xl border border-border-subtle bg-surface/60 px-3 py-2.5 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-text-secondary truncate max-md:whitespace-normal max-md:break-words max-md:line-clamp-2" title={h.label}>
                  {h.label}
                </p>
                <p className="text-lg font-bold text-white tabular-nums mt-0.5 truncate" title={h.exact}>
                  {h.text || '—'}
                </p>
                {h.exact && <p className="text-[10px] text-text-secondary tabular-nums truncate">{h.exact}</p>}
              </div>
            ))}
          </div>
        )}

        {result.warnings.map((w, i) => (
          <p
            key={i}
            className="flex items-start gap-1.5 text-[11px] text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2.5 py-2"
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
            {w}
          </p>
        ))}

        {isLoading && !data ? (
          <p className="text-[12px] text-text-secondary py-10 text-center">Loading the live data…</p>
        ) : cfg.values.length === 0 ? (
          <div className="rounded-xl border border-dashed border-brand-pink-500/40 bg-brand-pink-500/5 px-4 py-10 text-center">
            <p className="text-sm font-semibold text-white">Choose what number to show</p>
            <p className="text-[11px] text-text-secondary mt-1">
              Open <strong className="text-brand-pink-300">Customise</strong> below and add something under{' '}
              <strong className="text-brand-pink-300">Show me</strong> — or just click one of the questions above.
            </p>
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border-subtle bg-surface/40 px-4 py-10 text-center">
            <p className="text-sm font-semibold text-white">Nothing matches these filters</p>
            <p className="text-[11px] text-text-secondary mt-1.5">
              Remove a filter chip above, or widen the dates. Downloads stay switched off until there is something to
              export.
            </p>
          </div>
        ) : matrix ? (
          <>
            {chart && <ReportChart model={chart} />}
            <PivotTableView matrix={matrix} caption={`${reportTitle} — ${plainCaption}`} />
            <InfoNote
              desktopClassName="text-[11px] text-text-secondary leading-relaxed"
              mobileLabel="What is counted"
              title="What is counted"
            >
              <Info className="w-3.5 h-3.5 inline-block -mt-0.5 mr-1 text-brand-pink-400" aria-hidden="true" />
              <strong className="text-white/85">What is counted:</strong> {def.basis} Data as of {String(asOf)}.
            </InfoNote>
          </>
        ) : null}
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 3 · Customise & download — builder, raw-rows Advanced, and downloads.    */}
      {/* ---------------------------------------------------------------- */}
      <section aria-labelledby="adv-h" className="glass-panel p-3 sm:p-4 flex flex-col gap-3 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setAdvanced((a) => !a)}
            aria-expanded={advanced}
            aria-controls="adv-body"
            id="adv-h"
            className="flex items-center gap-2 text-left cursor-pointer rounded-lg px-1 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-400 focus-visible:ring-offset-1 focus-visible:ring-offset-panel"
          >
            <SlidersHorizontal className="w-4 h-4 text-brand-pink-400 shrink-0" aria-hidden="true" />
            <span className="flex flex-col">
              <span className="text-sm font-bold text-white">3 · Customise / build your own</span>
              <span className="text-[11px] text-text-secondary">
                Change the data, the grouping and the filters yourself. Optional.
              </span>
            </span>
            <ChevronDown
              className={clsx('w-4 h-4 text-text-secondary transition-transform shrink-0', advanced && 'rotate-180')}
              aria-hidden="true"
            />
          </button>
          {advanced && (
            <button
              type="button"
              onClick={resetAll}
              className="flex items-center gap-1.5 px-2.5 min-h-[36px] rounded-lg border border-border-subtle bg-surface text-[10px] font-bold uppercase tracking-wider text-text-secondary hover:text-white hover:border-brand-pink-500/50 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-400"
            >
              <RotateCcw className="w-3 h-3" aria-hidden="true" />
              Start over
            </button>
          )}
        </div>

        {advanced && (
          <div id="adv-body" className="flex flex-col gap-4 min-w-0 pt-1 border-t border-border-subtle">
            {/* Which data */}
            <div className="flex flex-col gap-2 min-w-0 pt-3">
              <div className="flex flex-col gap-0.5">
                <h3 className="text-[12px] font-bold text-white">Which information?</h3>
                <p className="text-[10px] text-text-secondary">Pick the set of records the report is built from.</p>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                {DATASETS.map((d) => {
                  const on = d.id === dsId;
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => switchDataset(d.id)}
                      aria-pressed={on}
                      className={clsx(
                        'flex flex-col items-start gap-0.5 px-3 py-2.5 min-h-[56px] rounded-xl border text-left transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-400 focus-visible:ring-offset-1 focus-visible:ring-offset-panel',
                        on
                          ? 'bg-brand-pink-500/15 border-brand-pink-500/60 shadow-[0_0_12px_rgba(218,26,132,0.25)]'
                          : 'bg-surface border-border-subtle hover:border-brand-pink-500/40'
                      )}
                    >
                      <span className={clsx('text-xs font-bold', on ? 'text-white' : 'text-text-secondary')}>
                        {d.label}
                      </span>
                      <span className="text-[10px] text-text-secondary leading-tight">{d.blurb}</span>
                    </button>
                  );
                })}
              </div>
              {def.summaryOnly && (
                <p className="flex items-start gap-1.5 text-[11px] text-brand-pink-300 bg-brand-pink-500/10 border border-brand-pink-500/30 rounded-lg px-2.5 py-2">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>
                    <strong>Totals only.</strong> {def.basis}
                  </span>
                </p>
              )}
            </div>

            {/* Layout */}
            <div className="flex flex-col gap-2 min-w-0">
              <div className="flex flex-col gap-0.5">
                <h3 className="text-[12px] font-bold text-white">How should it be laid out?</h3>
                <p className="text-[10px] text-text-secondary">
                  Drag a field from the list into a box, or press “+ Add” inside the box. Both work the same way.
                </p>
              </div>
              <div className="grid lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)] gap-4 min-w-0">
                <div className="min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-text-secondary">
                    Fields you can use
                  </span>
                  <div className="mt-2">
                    <FieldList def={def} onAdd={(z, k) => addToZone(z, k)} usage={usage} />
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-3 min-w-0">
                  {(['rows', 'cols', 'values', 'filters'] as ZoneId[]).map((z) => (
                    <Zone
                      key={z}
                      zone={z}
                      def={def}
                      items={zoneItems(z)}
                      onDropPayload={handleDrop(z)}
                      onRemove={(i) => removeFromZone(z, i)}
                      onMove={(i, dir) => moveWithin(z, i, dir)}
                      onAggChange={
                        z === 'values'
                          ? (i, agg) => {
                              markCustom();
                              setCfg((c) => ({
                                ...c,
                                values: c.values.map((v, vi) => (vi === i ? { ...v, agg: agg as AggId } : v)),
                              }));
                            }
                          : undefined
                      }
                      onLabelChange={
                        z === 'values'
                          ? (i, label) => {
                              markCustom();
                              setCfg((c) => ({
                                ...c,
                                values: c.values.map((v, vi) => (vi === i ? { ...v, label } : v)),
                              }));
                            }
                          : undefined
                      }
                      onOpenPicker={z === 'filters' ? (k) => setOpenDim(k as ReportDimKey) : undefined}
                      addMenu={<ZoneAddMenu zone={z} def={def} onAdd={(k) => addToZone(z, k)} />}
                    />
                  ))}
                </div>
              </div>

              {notice && (
                <p
                  role="status"
                  className="flex items-start gap-1.5 text-[11px] text-brand-pink-300 bg-brand-pink-500/10 border border-brand-pink-500/30 rounded-lg px-2.5 py-2"
                >
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                  {notice}
                </p>
              )}
            </div>

            {/* Narrow it down */}
            <div className="flex flex-col gap-2 min-w-0">
              <div className="flex flex-col gap-0.5">
                <h3 className="text-[12px] font-bold text-white">{ZONE_META.filters.label}</h3>
                <p className="text-[10px] text-text-secondary">
                  {ZONE_META.filters.help} These choices are separate from the filters at the top of the dashboard.
                </p>
              </div>

              {def.dateDim ? (
                <CollapsibleSection
                  id="rp-date"
                  title={def.dateLabel}
                  count={rf.from || rf.to ? 1 : 0}
                  defaultOpen={!!(rf.from || rf.to)}
                >
                  <div className="flex flex-wrap gap-1.5">
                    {presets.map((p) => {
                      const on = p.label === activePresetLabel;
                      return (
                        <button
                          key={p.label}
                          type="button"
                          onClick={() => setRange(p.from, p.to, p.label)}
                          aria-pressed={on}
                          className={clsx(
                            'px-2.5 min-h-[40px] rounded-lg text-[11px] font-medium transition-all border cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-400 focus-visible:ring-offset-1 focus-visible:ring-offset-panel',
                            on
                              ? 'bg-brand-pink-500/20 border-brand-pink-500/60 text-white shadow-[0_0_10px_rgba(218,26,132,0.3)]'
                              : 'bg-surface border-border-subtle text-text-secondary hover:text-white hover:border-brand-pink-500/40'
                          )}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={rf.from}
                      aria-label="From date"
                      onChange={(e) => setRange(e.target.value, rf.to)}
                      className="flex-1 min-w-0 bg-surface border border-border-subtle rounded-lg px-2.5 min-h-[40px] text-xs text-white focus:outline-none focus:border-brand-purple-400"
                    />
                    <input
                      type="date"
                      value={rf.to}
                      aria-label="To date"
                      onChange={(e) => setRange(rf.from, e.target.value)}
                      className="flex-1 min-w-0 bg-surface border border-border-subtle rounded-lg px-2.5 min-h-[40px] text-xs text-white focus:outline-none focus:border-brand-purple-400"
                    />
                  </div>
                  <p className="text-[10px] text-text-secondary italic">{def.note}</p>
                </CollapsibleSection>
              ) : (
                !def.summaryOnly && <p className="text-[11px] text-text-secondary italic">{def.basis}</p>
              )}

              {def.dims.length > 0 ? (
                <div className="grid sm:grid-cols-2 gap-3">
                  {def.dims.map((d) => (
                    <CollapsibleSection
                      key={`${d}-${openDim === d ? 'open' : 'closed'}`}
                      id={`rp-${d}`}
                      title={DIM_LABEL[d]}
                      count={(rf[d] as Set<string>).size}
                      defaultOpen={openDim === d || (rf[d] as Set<string>).size > 0}
                    >
                      <MultiSelectField
                        label={DIM_LABEL[d]}
                        options={options[d]}
                        selected={rf[d] as Set<string>}
                        onToggle={(v) => toggleDim(d, v)}
                        onClear={() => clearDim(d)}
                        maxHeightClass="max-h-40"
                        tone="pink"
                        emptyHint={`No ${DIM_LABEL[d].toLowerCase()} values in this data.`}
                      />
                    </CollapsibleSection>
                  ))}
                </div>
              ) : (
                !def.summaryOnly && (
                  <p className="text-[11px] text-text-secondary italic">Nothing to narrow down on this data.</p>
                )
              )}
            </div>

            {/* Advanced — the underlying raw rows, folded away (default = the
                smart summary, rows OFF). */}
            <AdvancedRawRows
              rawSheet={rawSheet}
              setRawSheet={setRawSheet}
              rawInstead={rawInstead}
              setRawInstead={setRawInstead}
              summaryOnly={!!def.summaryOnly}
              noun={noun}
              rowCount={rows.length}
            />
          </div>
        )}

        {/* Download hub — always reachable, so a report built from a template is
            downloadable even with the builder folded away. */}
        <div className="flex flex-col gap-3 pt-3 border-t border-border-subtle">
          <div className="flex flex-col gap-0.5">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Download className="w-4 h-4 text-brand-pink-400" aria-hidden="true" /> Download this report
            </h3>
            <p className="text-[11px] text-text-secondary">
              Every file lists the filters you applied, so anyone opening it can see exactly what it covers.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <DownloadBtn
              onClick={doExcel}
              disabled={!canExport || busy !== null}
              busy={busy === 'excel'}
              icon={<FileSpreadsheet className="w-4 h-4" />}
              label="Excel"
              sub=".xlsx"
            />
            <DownloadBtn
              onClick={doCsv}
              disabled={!canExport || busy !== null}
              busy={busy === 'csv'}
              icon={<Table2 className="w-4 h-4" />}
              label="CSV"
              sub=".csv"
            />
            <DownloadBtn
              onClick={doPdf}
              disabled={!canExport || busy !== null}
              busy={busy === 'pdf'}
              icon={<FileText className="w-4 h-4" />}
              label="PDF"
              sub="print-ready"
            />
          </div>
          <p className="text-[10px] text-text-secondary truncate" title={reportFilename(dsId, rf, def, 'csv', mode)}>
            {canExport ? <>File name: {reportFilename(dsId, rf, def, 'csv', mode)}</> : 'Nothing to download yet.'}
          </p>
        </div>
      </section>
    </div>
  );
}

function DownloadBtn({
  onClick, disabled, busy, icon, label, sub,
}: {
  onClick: () => void;
  disabled: boolean;
  busy: boolean;
  icon: React.ReactNode;
  label: string;
  sub: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 px-3.5 min-h-[46px] rounded-xl bg-brand-pink-500 text-white hover:bg-brand-pink-400 transition-colors shadow-[0_0_12px_rgba(218,26,132,0.35)] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-300 focus-visible:ring-offset-1 focus-visible:ring-offset-panel"
    >
      {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : icon}
      <span className="flex flex-col items-start leading-none gap-0.5">
        <span className="text-[12px] font-bold">{label}</span>
        <span className="text-[9px] font-medium text-white/70">{sub}</span>
      </span>
    </button>
  );
}

/**
 * The raw-rows Advanced accordion — collapsed by default so the primary flow is
 * the smart summary. Lives inside the Customise hub; toggling either checkbox
 * changes what the download buttons above emit.
 */
function AdvancedRawRows({
  rawSheet, setRawSheet, rawInstead, setRawInstead, summaryOnly, noun, rowCount,
}: {
  rawSheet: boolean;
  setRawSheet: (v: boolean) => void;
  rawInstead: boolean;
  setRawInstead: (v: boolean) => void;
  summaryOnly: boolean;
  noun: string;
  rowCount: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2 min-w-0 pt-1 border-t border-border-subtle/60">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="adv-raw-body"
        className="flex items-center gap-2 text-left cursor-pointer rounded-lg px-1 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-400 focus-visible:ring-offset-1 focus-visible:ring-offset-panel"
      >
        <Layers className="w-4 h-4 text-brand-pink-400 shrink-0" aria-hidden="true" />
        <span className="flex flex-col">
          <span className="text-[12px] font-bold text-white">Advanced</span>
          <span className="text-[10px] text-text-secondary">
            Include the individual records behind the numbers. Off by default — the report downloads as a smart summary.
          </span>
        </span>
        <ChevronDown
          className={clsx('w-4 h-4 text-text-secondary transition-transform shrink-0', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {open && (
        <fieldset
          id="adv-raw-body"
          className="rounded-xl border border-border-subtle bg-surface/40 px-3 py-2.5 flex flex-col gap-2 min-w-0"
        >
          <legend className="px-1 text-[11px] font-bold text-white">Include the underlying rows</legend>
          <p className="text-[10px] text-text-secondary -mt-1">
            The individual records behind these numbers — one line per {noun}.
          </p>
          <label className="flex items-start gap-2 text-[11px] text-text-secondary hover:text-white cursor-pointer min-h-[32px]">
            <input
              type="checkbox"
              checked={rawSheet}
              disabled={rawInstead || summaryOnly}
              onChange={(e) => setRawSheet(e.target.checked)}
              className="mt-0.5 accent-[#da1a84] w-4 h-4 cursor-pointer disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-400"
            />
            <span>
              Add them as an extra sheet in the Excel file
              {summaryOnly && <span className="text-text-secondary/70"> — not available for this data</span>}
            </span>
          </label>
          <label className="flex items-start gap-2 text-[11px] text-text-secondary hover:text-white cursor-pointer min-h-[32px]">
            <input
              type="checkbox"
              checked={rawInstead}
              onChange={(e) => setRawInstead(e.target.checked)}
              className="mt-0.5 accent-[#da1a84] w-4 h-4 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-400"
            />
            <span>Download the {rowCount.toLocaleString('en-IN')} rows instead of the report as shown</span>
          </label>
        </fieldset>
      )}
    </div>
  );
}
