'use client';

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  Table2, Sparkles, RotateCcw, AlertTriangle, Info, FileSpreadsheet, FileText, Loader2, ArrowDownUp,
} from 'lucide-react';
import { useDashboard } from '@/lib/DashboardContext';
import { buildDatePresets, latestLeadDate, activePreset } from '@/lib/datePresets';
import { CollapsibleSection, MultiSelectField } from '@/components/FilterControls';
import { FieldList, Zone, ZoneAddMenu, PivotTableView, type DragPayload } from '@/components/PivotBuilder';
import {
  DATASETS, DIM_LABEL, TEMPLATES, computePivot, datasetById, defaultAgg, emptyReportFilters,
  fieldByKey, filterOptions, reportFilename, selectRows, seedFromGlobal, valueLabel,
  buildFilterSummary, exportPivotCsv, exportRawCsv, exportExcel, exportPdf, expandRow, PDF_ROW_CAP,
  type AggId, type PivotConfig, type ReportDatasetId, type ReportDimKey, type ReportFilterState,
  type ValueSpec, type ZoneId,
} from '@/lib/reportEngine';

/* ==================================================================
 * /reports — the pivot-table report builder.
 *
 * Replaces the old "Create report" modal outright: ONE report tool, on its
 * own page, with drop zones that behave like a simple Excel pivot table.
 * Its filter state is INDEPENDENT of the dashboard's global filters but is
 * seeded from them on first load, so arriving here feels continuous.
 * ================================================================== */

/** Which filter dimension a pivot field maps onto (for the Filters zone). */
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

export default function ReportsPage() {
  const { data, filters, leadsAsOf, isLoading, error } = useDashboard();

  const [dsId, setDsId] = useState<ReportDatasetId>('deals');
  const [rf, setRf] = useState<ReportFilterState>(emptyReportFilters);
  const [cfg, setCfg] = useState<PivotConfig>(() => datasetById('deals').defaults);
  const [sortByTotal, setSortByTotal] = useState(true);
  const [mode, setMode] = useState<'pivot' | 'raw'>('pivot');
  const [rawSheet, setRawSheet] = useState(false);
  const [busy, setBusy] = useState<'csv' | 'excel' | 'pdf' | null>(null);
  const [filterZone, setFilterZone] = useState<ReportDimKey[]>([]);
  const [openDim, setOpenDim] = useState<ReportDimKey | null>(null);
  const [seeded, setSeeded] = useState(false);
  const [notice, setNotice] = useState('');

  const def = useMemo(() => datasetById(dsId), [dsId]);

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

  const asOf = (data as any)?.deals?.generated || leadsAsOf || (data as any)?.generated || '—';

  /* ---------------- zone plumbing ---------------- */

  const switchDataset = (next: ReportDatasetId) => {
    setDsId(next);
    setCfg(datasetById(next).defaults);
    setFilterZone([]);
    setOpenDim(null);
    setNotice('');
  };

  const addToZone = (zone: ZoneId, key: string, atIndex?: number) => {
    setNotice('');
    if (zone === 'filters') {
      const dim = dimForField(dsId, key);
      if (!dim || !def.dims.includes(dim)) {
        setNotice(`${fieldByKey(def, key)?.label || key} cannot be used as a filter on ${def.label}.`);
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
      setNotice('“Records” is a measure — drop it in Values.');
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

  const toggleDim = (key: ReportDimKey, value: string) =>
    setRf((prev) => {
      const next = { ...prev, [key]: new Set(prev[key]) } as ReportFilterState;
      const s = next[key] as Set<string>;
      if (s.has(value)) s.delete(value);
      else s.add(value);
      return next;
    });

  const clearDim = (key: ReportDimKey) => setRf((prev) => ({ ...prev, [key]: new Set() }) as ReportFilterState);
  const setRange = (from: string, to: string, presetLabel = '') => setRf((prev) => ({ ...prev, from, to, presetLabel }));
  const resetAll = () => {
    setRf(emptyReportFilters());
    setCfg(def.defaults);
    setFilterZone([]);
    setNotice('');
  };

  const applyTemplate = (id: string) => {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    const fyStart: string = (data as any)?.deals?.fees?.fy?.fyStart || '';
    const latest = latestLeadDate(data?.leads);
    setDsId(t.dataset);
    setCfg({
      rows: [...t.config.rows],
      cols: [...t.config.cols],
      values: t.config.values.map((v) => ({ ...v, id: nextValueId() })),
    });
    const base = emptyReportFilters();
    setRf(t.filters ? t.filters(base, { fyStart, latest }) : base);
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

  const caption = useMemo(() => {
    const vals = cfg.values.map((v) => valueLabel(v, fieldByKey(def, v.field))).join(', ');
    const by = cfg.rows.map((k) => fieldByKey(def, k)?.label || k).join(' › ');
    const across = cfg.cols.map((k) => fieldByKey(def, k)?.label || k).join(' › ');
    return [vals || '—', by && `by ${by}`, across && `across ${across}`].filter(Boolean).join(' · ');
  }, [cfg, def]);

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
        title: 'Filters applied',
        subtitle: `Business Development — ${def.label} ${mode === 'pivot' ? 'pivot' : 'raw rows'}${def.summaryOnly ? ' (summary)' : ''}`,
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

  /* ---------------- render ---------------- */

  const activeFilterText = useMemo(() => {
    const parts: string[] = [];
    if (def.dateDim && (rf.from || rf.to)) parts.push(`Date ${rf.from || 'start'} → ${rf.to || 'today'}`);
    def.dims.forEach((d) => {
      const s = rf[d] as Set<string>;
      if (s.size) parts.push(`${DIM_LABEL[d]}: ${Array.from(s).join(', ')}`);
    });
    return parts.length ? parts.join('  ·  ') : 'None — all data';
  }, [def, rf]);

  if (error) {
    return (
      <div className="glass-panel p-6 text-center">
        <p className="text-sm font-semibold text-white">Report builder unavailable</p>
        <p className="text-[12px] text-text-secondary mt-1">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 sm:gap-5 min-w-0">
      {/* Header */}
      <header className="flex flex-col gap-1 min-w-0">
        <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2 min-w-0">
          <Table2 className="w-5 h-5 text-brand-pink-400 shrink-0" aria-hidden="true" />
          <span className="truncate">Report builder</span>
        </h1>
        <p className="text-[12px] text-text-secondary">
          Build a pivot table from any dataset — drag fields into Rows, Columns and Values, then download it. These
          filters are independent of the dashboard filters (seeded from them on arrival).
        </p>
      </header>

      {/* Quick-start templates */}
      <section aria-labelledby="tpl-h" className="glass-panel p-3 sm:p-4 flex flex-col gap-2.5 min-w-0">
        <h2 id="tpl-h" className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-brand-pink-400" aria-hidden="true" />
          Quick start
        </h2>
        <div className="flex flex-wrap gap-2">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => applyTemplate(t.id)}
              title={t.blurb}
              className="flex flex-col items-start gap-0.5 px-3 py-2 min-h-[44px] rounded-xl border border-border-subtle bg-surface hover:border-brand-pink-500/50 hover:bg-brand-pink-500/10 transition-colors text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-400 focus-visible:ring-offset-1 focus-visible:ring-offset-panel active:scale-95"
            >
              <span className="text-[11px] font-bold text-white">{t.label}</span>
              <span className="text-[10px] text-text-secondary">{t.blurb}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Dataset */}
      <section aria-labelledby="ds-h" className="glass-panel p-3 sm:p-4 flex flex-col gap-2.5 min-w-0">
        <h2 id="ds-h" className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
          1 · Dataset
        </h2>
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
                  'flex flex-col items-start gap-0.5 px-3 py-2.5 min-h-[52px] rounded-xl border text-left transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-400 focus-visible:ring-offset-1 focus-visible:ring-offset-panel',
                  on
                    ? 'bg-brand-pink-500/15 border-brand-pink-500/60 shadow-[0_0_12px_rgba(218,26,132,0.25)]'
                    : 'bg-surface border-border-subtle hover:border-brand-pink-500/40'
                )}
              >
                <span className={clsx('text-xs font-bold', on ? 'text-white' : 'text-text-secondary')}>{d.label}</span>
                <span className="text-[10px] text-text-secondary leading-tight">{d.blurb}</span>
              </button>
            );
          })}
        </div>
        {def.summaryOnly && (
          <p className="flex items-start gap-1.5 text-[11px] text-brand-pink-300 bg-brand-pink-500/10 border border-brand-pink-500/30 rounded-lg px-2.5 py-2">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              <strong>Summary only.</strong> {def.note}
            </span>
          </p>
        )}
      </section>

      {/* Builder */}
      <section aria-labelledby="build-h" className="glass-panel p-3 sm:p-4 flex flex-col gap-3 min-w-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 id="build-h" className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
            2 · Pivot layout
          </h2>
          <button
            type="button"
            onClick={resetAll}
            className="flex items-center gap-1.5 px-2.5 min-h-[36px] rounded-lg border border-border-subtle bg-surface text-[10px] font-bold uppercase tracking-wider text-text-secondary hover:text-white hover:border-brand-pink-500/50 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-400"
          >
            <RotateCcw className="w-3 h-3" aria-hidden="true" />
            Reset
          </button>
        </div>

        <div className="grid lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)] gap-4 min-w-0">
          <div className="min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-widest text-text-secondary">Available fields</span>
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
                    ? (i, agg) =>
                        setCfg((c) => ({
                          ...c,
                          values: c.values.map((v, vi) => (vi === i ? { ...v, agg: agg as AggId } : v)),
                        }))
                    : undefined
                }
                onLabelChange={
                  z === 'values'
                    ? (i, label) =>
                        setCfg((c) => ({ ...c, values: c.values.map((v, vi) => (vi === i ? { ...v, label } : v)) }))
                    : undefined
                }
                onOpenPicker={z === 'filters' ? (k) => setOpenDim(k as ReportDimKey) : undefined}
                addMenu={<ZoneAddMenu zone={z} def={def} onAdd={(k) => addToZone(z, k)} />}
              />
            ))}
          </div>
        </div>

        {notice && (
          <p role="status" className="flex items-start gap-1.5 text-[11px] text-brand-pink-300 bg-brand-pink-500/10 border border-brand-pink-500/30 rounded-lg px-2.5 py-2">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
            {notice}
          </p>
        )}
      </section>

      {/* Filters */}
      <section aria-labelledby="flt-h" className="glass-panel p-3 sm:p-4 flex flex-col gap-3 min-w-0">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <h2 id="flt-h" className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
            3 · Filters
          </h2>
          <span className="text-[10px] text-text-secondary">Independent of the dashboard filters.</span>
        </div>

        {def.dateDim ? (
          <CollapsibleSection id="rp-date" title="Date range" count={rf.from || rf.to ? 1 : 0} defaultOpen>
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
                aria-label="Report start date"
                onChange={(e) => setRange(e.target.value, rf.to)}
                className="flex-1 min-w-0 bg-surface border border-border-subtle rounded-lg px-2.5 min-h-[40px] text-xs text-white focus:outline-none focus:border-brand-purple-400"
              />
              <input
                type="date"
                value={rf.to}
                aria-label="Report end date"
                onChange={(e) => setRange(rf.from, e.target.value)}
                className="flex-1 min-w-0 bg-surface border border-border-subtle rounded-lg px-2.5 min-h-[40px] text-xs text-white focus:outline-none focus:border-brand-purple-400"
              />
            </div>
            <p className="text-[10px] text-text-secondary italic">{def.note}</p>
          </CollapsibleSection>
        ) : (
          !def.summaryOnly && <p className="text-[11px] text-text-secondary italic">{def.note}</p>
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
                  emptyHint={`No ${DIM_LABEL[d].toLowerCase()} values in this dataset.`}
                />
              </CollapsibleSection>
            ))}
          </div>
        ) : (
          !def.summaryOnly && <p className="text-[11px] text-text-secondary italic">No filter dimensions apply to this dataset.</p>
        )}
      </section>

      {/* Result */}
      <section aria-labelledby="res-h" className="glass-panel p-3 sm:p-4 flex flex-col gap-3 min-w-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 id="res-h" className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
            4 · Result
          </h2>
          <div className="flex items-center gap-3 flex-wrap">
            <span aria-live="polite" className="text-[11px] text-white">
              <strong className="text-brand-pink-300 tabular-nums">{rows.length.toLocaleString('en-IN')}</strong>{' '}
              {def.summaryOnly ? 'summary rows' : `row${rows.length === 1 ? '' : 's'}`} match
              {matrix && (
                <>
                  {' '}· <strong className="text-brand-pink-300 tabular-nums">{result.bodyRows.toLocaleString('en-IN')}</strong>{' '}
                  pivot row{result.bodyRows === 1 ? '' : 's'} ×{' '}
                  <strong className="text-brand-pink-300 tabular-nums">{result.colGroups}</strong> column group
                  {result.colGroups === 1 ? '' : 's'}
                </>
              )}
            </span>
            <button
              type="button"
              onClick={() => setSortByTotal((s) => !s)}
              aria-pressed={sortByTotal}
              className="flex items-center gap-1.5 px-2.5 min-h-[36px] rounded-lg border border-border-subtle bg-surface text-[10px] font-bold uppercase tracking-wider text-text-secondary hover:text-white hover:border-brand-pink-500/50 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-400"
            >
              <ArrowDownUp className="w-3 h-3" aria-hidden="true" />
              Rows: {sortByTotal ? 'total ↓' : 'A→Z'}
            </button>
          </div>
        </div>

        {result.warnings.map((w, i) => (
          <p key={i} className="flex items-start gap-1.5 text-[11px] text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2.5 py-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
            {w}
          </p>
        ))}

        {isLoading && !data ? (
          <p className="text-[12px] text-text-secondary py-8 text-center">Loading the live dataset…</p>
        ) : cfg.values.length === 0 ? (
          <div className="rounded-xl border border-dashed border-brand-pink-500/40 bg-brand-pink-500/5 px-4 py-10 text-center">
            <p className="text-sm font-semibold text-white">Add a field to Values to see results</p>
            <p className="text-[11px] text-text-secondary mt-1">
              Drop a field into <strong className="text-brand-pink-300">Values</strong> (or use its “+” menu) — numbers
              default to Sum, everything else to Count.
            </p>
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border-subtle bg-surface/40 px-4 py-10 text-center">
            <p className="text-sm font-semibold text-white">No rows match these filters</p>
            <p className="text-[11px] text-text-secondary mt-1.5">
              Active filters — <span className="text-white/80">{activeFilterText}</span>
            </p>
            <p className="text-[11px] text-text-secondary mt-1">
              Widen the date range or clear a dimension. Downloads stay disabled until there is something to export.
            </p>
          </div>
        ) : matrix ? (
          <>
            <p className="text-[11px] text-text-secondary">
              <span className="text-white font-semibold">{caption}</span> · data as of {String(asOf)}
            </p>
            <PivotTableView matrix={matrix} caption={caption} />
          </>
        ) : null}
      </section>

      {/* Export */}
      <section aria-labelledby="exp-h" className="glass-panel p-3 sm:p-4 flex flex-col gap-3 min-w-0">
        <h2 id="exp-h" className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
          5 · Download
        </h2>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-black/40 p-1 rounded-lg border border-border-subtle/50" role="group" aria-label="What to export">
            {(['pivot', 'raw'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={clsx(
                  'px-3 min-h-[36px] rounded-md text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple-400',
                  mode === m ? 'bg-brand-purple-500/25 text-brand-purple-200' : 'text-text-secondary hover:text-white'
                )}
              >
                {m === 'pivot' ? 'Pivot as displayed' : `Raw rows (${rows.length.toLocaleString('en-IN')})`}
              </button>
            ))}
          </div>
          {mode === 'pivot' && !def.summaryOnly && (
            <label className="flex items-center gap-2 text-[11px] text-text-secondary hover:text-white cursor-pointer min-h-[36px]">
              <input
                type="checkbox"
                checked={rawSheet}
                onChange={(e) => setRawSheet(e.target.checked)}
                className="accent-[#da1a84] w-4 h-4 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-400"
              />
              Add a Raw sheet to the Excel file
            </label>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[10px] text-text-secondary min-w-0 flex-1 truncate" title={reportFilename(dsId, rf, def, 'csv', mode)}>
            {canExport ? reportFilename(dsId, rf, def, 'csv', mode) : 'Nothing to export yet'}
          </p>
          <div className="flex gap-2 shrink-0">
            <DownloadBtn onClick={doCsv} disabled={!canExport || busy !== null} busy={busy === 'csv'} icon={<Table2 className="w-3.5 h-3.5" />} label="CSV" />
            <DownloadBtn onClick={doExcel} disabled={!canExport || busy !== null} busy={busy === 'excel'} icon={<FileSpreadsheet className="w-3.5 h-3.5" />} label="Excel" />
            <DownloadBtn onClick={doPdf} disabled={!canExport || busy !== null} busy={busy === 'pdf'} icon={<FileText className="w-3.5 h-3.5" />} label="PDF" />
          </div>
        </div>
        <p className="text-[10px] text-text-secondary">
          Excel always carries a <strong className="text-white/80">Filters applied</strong> sheet (filters, row count,
          data as of) alongside the {mode === 'pivot' ? 'Pivot' : 'Raw'} sheet. The PDF repeats the same header block.
        </p>
      </section>
    </div>
  );
}

function DownloadBtn({
  onClick, disabled, busy, icon, label,
}: {
  onClick: () => void;
  disabled: boolean;
  busy: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 px-3 min-h-[40px] rounded-lg bg-brand-pink-500 text-[11px] font-bold text-white hover:bg-brand-pink-400 transition-colors shadow-[0_0_12px_rgba(218,26,132,0.35)] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-300 focus-visible:ring-offset-1 focus-visible:ring-offset-panel"
    >
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : icon}
      {label}
    </button>
  );
}
