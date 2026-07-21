'use client';

import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { X, FileSpreadsheet, FileText, Table2, Loader2, ClipboardList, Info } from 'lucide-react';
import { useDashboard, type Filters } from '@/lib/DashboardContext';
import { useDialog } from '@/lib/useDialog';
import { recordDate, type DealRecord } from '@/lib/dealsRuntime';
import { buildDatePresets, latestLeadDate, activePreset } from '@/lib/datePresets';
import { downloadCsv, type CsvColumn } from '@/lib/csv';
import { MultiSelectField } from './FilterControls';

/* ==================================================================
 * ReportBuilder — build & download a custom report from any page.
 *
 * Deliberately keeps its OWN filter state, seeded from the global filters
 * each time it opens, so the user can widen/narrow an export without
 * disturbing the dashboard they are looking at.
 * ================================================================== */

export type ReportDatasetId = 'leads' | 'deals' | 'bd' | 'proposals';
export type ReportDimKey = 'brand' | 'status' | 'stage' | 'owner' | 'region' | 'state' | 'city' | 'cluster';

export interface ReportColumn {
  key: string;
  label: string;
  format?: (row: any) => string | number | null | undefined;
}

export interface ReportFilterState {
  from: string;
  to: string;
  presetLabel: string;
  brand: Set<string>;
  status: Set<string>;
  stage: Set<string>;
  owner: Set<string>;
  region: Set<string>;
  state: Set<string>;
  city: Set<string>;
  cluster: Set<string>;
}

interface DatasetDef {
  id: ReportDatasetId;
  label: string;
  blurb: string;
  /** Filter dimensions this dataset can genuinely honour. */
  dims: ReportDimKey[];
  /** Whether a date range applies at all. */
  dateDim: boolean;
  /** Org-wide aggregates only — no row-level records exist in the feed. */
  summaryOnly?: boolean;
  note?: string;
  columns: ReportColumn[];
}

const DIM_LABEL: Record<ReportDimKey, string> = {
  brand: 'Brand',
  status: 'Lead status',
  stage: 'Deal stage',
  owner: 'BD / owner',
  region: 'Region',
  state: 'State',
  city: 'City',
  cluster: 'Cluster',
};

const yesNo = (v: any) => (v === true ? 'Yes' : v === false ? 'No' : '');
const nz = (v: any) => (v == null || v === '' ? '' : v);

const DATASETS: DatasetDef[] = [
  {
    id: 'leads',
    label: 'Leads',
    blurb: 'One row per lead enquiry',
    dims: ['brand', 'status', 'owner', 'region', 'state', 'city', 'cluster'],
    dateDim: true,
    note: 'Date range filters leads on their enquiry date (dt).',
    columns: [
      { key: 'dt', label: 'Date' },
      { key: 'brand', label: 'Brand' },
      { key: 'status', label: 'Status', format: (r) => r.status || '(unassigned)' },
      { key: 'owner', label: 'BD Owner', format: (r) => nz(r.owner) },
      { key: 'source', label: 'Source', format: (r) => nz(r.source) },
      { key: 'region', label: 'Region' },
      { key: 'state', label: 'State' },
      { key: 'city', label: 'City' },
      { key: 'cluster', label: 'Cluster' },
      { key: 'prop', label: 'Property Status' },
      { key: 'dropReason', label: 'Drop Reason', format: (r) => nz(r.dropReason) },
      { key: 'ci', label: 'Contact Initiated', format: (r) => yesNo(r.ci) },
    ],
  },
  {
    id: 'deals',
    label: 'Deals',
    blurb: 'One row per deal record',
    dims: ['brand', 'stage', 'owner', 'region', 'state'],
    dateDim: true,
    note:
      'Date range uses the contracted-date rule: won deals by signing date (Spark by its LOI date, Olive/Open by MA date), LOI Signed by its LOI date, open & dropped by expected date. Undated deals are excluded while a date filter is active.',
    columns: [
      { key: 'id', label: 'Deal ID' },
      { key: 'name', label: 'Deal' },
      { key: 'brand', label: 'Brand' },
      { key: 'stage', label: 'Stage' },
      { key: 'stageType', label: 'Stage Type' },
      { key: 'contractedDate', label: 'Contracted / Expected Date', format: (r) => nz(recordDate(r as DealRecord)) },
      { key: 'signingDate', label: 'Signing Date', format: (r) => nz(r.signingDate) },
      { key: 'maDate', label: 'MA Date', format: (r) => nz(r.maDate) },
      { key: 'expectedDate', label: 'Expected Date', format: (r) => nz(r.expectedDate) },
      { key: 'keys', label: 'Keys', format: (r) => Number(r.keys) || 0 },
      { key: 'feeContracted', label: 'TA Fee Contracted', format: (r) => Number(r.feeContracted) || 0 },
      { key: 'feeCollected', label: 'TA Fee Collected', format: (r) => Number(r.feeCollected) || 0 },
      { key: 'feePending', label: 'TA Fee Pending', format: (r) => Number(r.feePending) || 0 },
      { key: 'owner', label: 'BD Owner', format: (r) => nz(r.owner) },
      { key: 'region', label: 'Region', format: (r) => nz(r.region) },
      { key: 'state', label: 'State', format: (r) => nz(r.state) },
      { key: 'signingProbability', label: 'Signing Probability', format: (r) => nz(r.signingProbability) },
      { key: 'propertyType', label: 'Property Type', format: (r) => nz(r.propertyType) },
      { key: 'landStatus', label: 'Land Status', format: (r) => nz(r.landStatus) },
    ],
  },
  {
    id: 'bd',
    label: 'BD Performance',
    blurb: 'One row per BD — targets vs achievement',
    dims: ['owner', 'region'],
    dateDim: false,
    note: 'BD performance is published as YTD aggregates, so a date range does not apply.',
    columns: [
      { key: 'rank', label: 'Rank' },
      { key: 'bd', label: 'BD' },
      { key: 'region', label: 'Region' },
      { key: 'regionHead', label: 'Region Head' },
      { key: 'ytdTarget', label: 'YTD Target' },
      { key: 'ytdAchievement', label: 'YTD Achieved' },
      { key: 'achievementPct', label: 'Achievement %' },
      { key: 'signed', label: 'MA Signed (all-time)' },
      { key: 'feeContracted', label: 'TA Fee Contracted (all-time)' },
      { key: 'email', label: 'Email' },
    ],
  },
  {
    id: 'proposals',
    label: 'Proposals',
    blurb: 'Summary only — org-wide aggregates',
    dims: [],
    dateDim: false,
    summaryOnly: true,
    note:
      'The proposals feed publishes org-wide aggregates ONLY — there are no per-proposal records, so this dataset exports a summary sheet and filters do not apply.',
    columns: [
      { key: 'section', label: 'Section' },
      { key: 'item', label: 'Item' },
      { key: 'metric', label: 'Metric' },
      { key: 'value', label: 'Value' },
    ],
  },
];

const FILENAME_BASE: Record<ReportDatasetId, string> = {
  leads: 'leads',
  deals: 'deals',
  bd: 'bd-performance',
  proposals: 'proposals-summary',
};

/** PDF is a snapshot, not a data dump — cap it and say so. */
const PDF_ROW_CAP = 2000;

function emptyReportFilters(): ReportFilterState {
  return {
    from: '',
    to: '',
    presetLabel: '',
    brand: new Set(),
    status: new Set(),
    stage: new Set(),
    owner: new Set(),
    region: new Set(),
    state: new Set(),
    city: new Set(),
    cluster: new Set(),
  };
}

/** Seed the builder from the page's global filters so it feels continuous. */
function seedFromGlobal(f: Filters): ReportFilterState {
  return {
    from: f.from,
    to: f.to,
    presetLabel: f.presetLabel,
    brand: new Set(f.brand),
    status: new Set(f.status),
    stage: new Set(),
    owner: new Set(f.owner),
    region: new Set(f.region),
    state: new Set(f.state),
    city: new Set(f.city),
    cluster: new Set(f.cluster),
  };
}

const normBrand = (b?: string) => String(b || '').trim() || 'Unknown';

function reportFilename(dsId: ReportDatasetId, rf: ReportFilterState, def: DatasetDef, ext: string): string {
  const parts: string[] = [FILENAME_BASE[dsId]];
  const vals: string[] = [];
  (['brand', 'stage', 'status', 'owner', 'region', 'state', 'city', 'cluster'] as const).forEach((k) => {
    if (!def.dims.includes(k as ReportDimKey)) return;
    const s = rf[k];
    if (s && s.size) vals.push(Array.from(s).join('-'));
  });
  if (vals.length) parts.push(vals.join('_'));
  if (def.dateDim && (rf.from || rf.to)) parts.push(`${rf.from || 'start'}_${rf.to || 'today'}`);
  else parts.push(new Date().toISOString().slice(0, 10));
  const base = parts
    .join('_')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '');
  return `${base}.${ext}`;
}

/* ---------------- proposals summary (never row-level) ---------------- */
function proposalSummaryRows(p: any): any[] {
  if (!p) return [];
  const out: { section: string; item: string; metric: string; value: string | number }[] = [];
  const push = (section: string, item: string, metric: string, value: any) => {
    if (value == null) return;
    out.push({ section, item, metric, value });
  };
  const t = p.totals || {};
  push('Overall', 'All proposals', 'Proposals', t.proposals);
  push('Overall', 'All proposals', 'Approved', t.approved);
  push('Overall', 'All proposals', 'Rejected', t.rejected);
  push('Overall', 'All proposals', 'Pending', t.pending);
  push('Overall', 'All proposals', 'Not routed', t.notRouted);
  push('Overall', 'All proposals', 'Approval rate %', t.approvalRatePct);

  Object.entries(p.byBrand || {}).forEach(([brand, v]: [string, any]) => {
    push('By brand', brand, 'Proposals', v?.proposals);
    push('By brand', brand, 'Approved', v?.approved);
    push('By brand', brand, 'Rejected', v?.rejected);
    push('By brand', brand, 'Pending', v?.pending);
  });
  Object.entries(p.byModel || {}).forEach(([model, v]: [string, any]) => {
    push('By model', model, 'Proposals', v?.proposals);
    push('By model', model, 'Approved', v?.approved);
    push('By model', model, 'Rejected', v?.rejected);
    push('By model', model, 'Pending', v?.pending);
  });
  const deptLabel: Record<string, string> = { salesRevenue: 'Sales & Revenue', design: 'Design', ops: 'Operations' };
  Object.entries(p.byDeptApproval || {}).forEach(([k, v]: [string, any]) => {
    const item = deptLabel[k] || k;
    push('By department approval', item, 'Required', v?.required);
    push('By department approval', item, 'Approved', v?.approved);
    push('By department approval', item, 'Rejected', v?.rejected);
    push('By department approval', item, 'Pending', v?.pending);
  });
  const arr = p.arrOccupancy;
  if (arr) {
    (
      [
        ['year1Arr', 'Year-1 ARR'],
        ['year1Occ', 'Year-1 occupancy'],
        ['stabilisedArr', 'Stabilised ARR'],
        ['stabilisedOcc', 'Stabilised occupancy'],
        ['landlordArr', 'Landlord ARR'],
        ['landlordOcc', 'Landlord occupancy'],
      ] as [string, string][]
    ).forEach(([k, label]) => {
      const v = arr[k];
      if (!v) return;
      push('ARR & occupancy', label, 'Average', v.avg);
      push('ARR & occupancy', label, 'Sample size (n)', v.n);
    });
  }
  return out;
}

/* ================================================================== */

export function ReportBuilder({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { data, filters, leadsAsOf } = useDashboard();
  const dialogRef = useDialog<HTMLDivElement>(onClose, isOpen);

  const [dsId, setDsId] = useState<ReportDatasetId>('leads');
  const [rf, setRf] = useState<ReportFilterState>(emptyReportFilters);
  const [cols, setCols] = useState<string[]>([]);
  const [busy, setBusy] = useState<'csv' | 'excel' | 'pdf' | null>(null);
  const [seeded, setSeeded] = useState(false);

  const def = useMemo(() => DATASETS.find((d) => d.id === dsId) || DATASETS[0], [dsId]);

  // Re-seed from the live global filters every time the dialog opens.
  useEffect(() => {
    if (!isOpen) {
      setSeeded(false);
      return;
    }
    if (seeded) return;
    setRf(seedFromGlobal(filters));
    setSeeded(true);
  }, [isOpen, seeded, filters]);

  // Sensible default: every column of the chosen dataset is on.
  useEffect(() => {
    setCols(def.columns.map((c) => c.key));
  }, [def]);

  const presets = useMemo(() => buildDatePresets(latestLeadDate(data?.leads)), [data]);
  const activePresetLabel = activePreset(presets, rf.presetLabel, rf.from, rf.to);

  const toggleDim = (key: ReportDimKey, value: string) =>
    setRf((prev) => {
      const next = { ...prev, [key]: new Set(prev[key]) } as ReportFilterState;
      const s = next[key] as Set<string>;
      if (s.has(value)) s.delete(value);
      else s.add(value);
      return next;
    });

  const clearDim = (key: ReportDimKey) => setRf((prev) => ({ ...prev, [key]: new Set() }) as ReportFilterState);

  const setRange = (from: string, to: string, presetLabel = '') =>
    setRf((prev) => ({ ...prev, from, to, presetLabel }));

  /* -------------------- available option lists -------------------- */
  const options = useMemo(() => {
    const o: Record<ReportDimKey, string[]> = {
      brand: [], status: [], stage: [], owner: [], region: [], state: [], city: [], cluster: [],
    };
    if (!data) return o;
    const uniq = (xs: (string | null | undefined)[]) =>
      Array.from(new Set(xs.filter((x): x is string => !!x && !!String(x).trim()))).sort();

    if (dsId === 'leads') {
      const L = data.leads || [];
      o.brand = uniq(L.map((l) => l.brand));
      o.status = uniq(L.map((l) => l.status || '(unassigned)'));
      o.owner = uniq(L.map((l) => l.owner));
      o.region = uniq(L.map((l) => l.region));
      o.state = uniq(L.map((l) => l.state));
      o.city = uniq(L.map((l) => l.city));
      o.cluster = uniq(L.map((l) => l.cluster));
    } else if (dsId === 'deals') {
      const R: DealRecord[] = Array.isArray((data as any).deals?.records) ? (data as any).deals.records : [];
      o.brand = uniq(R.map((r) => normBrand(r.brand)));
      o.stage = uniq(R.map((r) => r.stage));
      o.owner = uniq(R.map((r) => r.owner));
      o.region = uniq(R.map((r) => r.region));
      o.state = uniq(R.map((r) => r.state));
    } else if (dsId === 'bd') {
      const B: any[] = Array.isArray((data as any).deals?.ranking?.bds) ? (data as any).deals.ranking.bds : [];
      o.owner = uniq(B.map((b) => b.bd));
      o.region = uniq(B.map((b) => b.region));
    }
    return o;
  }, [data, dsId]);

  /* -------------------- the resulting rows -------------------- */
  const rows = useMemo(() => {
    if (!data) return [];

    if (dsId === 'leads') {
      return (data.leads || []).filter((l: any) => {
        if (rf.from && l.dt < rf.from) return false;
        if (rf.to && l.dt > rf.to) return false;
        if (rf.brand.size && !rf.brand.has(l.brand)) return false;
        if (rf.status.size && !rf.status.has(l.status || '(unassigned)')) return false;
        if (rf.owner.size && !(l.owner && rf.owner.has(l.owner))) return false;
        if (rf.region.size && !rf.region.has(l.region)) return false;
        if (rf.state.size && !rf.state.has(l.state)) return false;
        if (rf.city.size && !rf.city.has(l.city)) return false;
        if (rf.cluster.size && !rf.cluster.has(l.cluster)) return false;
        return true;
      });
    }

    if (dsId === 'deals') {
      const R: DealRecord[] = Array.isArray((data as any).deals?.records) ? (data as any).deals.records : [];
      return R.filter((r) => {
        if (rf.brand.size && !rf.brand.has(normBrand(r.brand))) return false;
        if (rf.stage.size && !(r.stage && rf.stage.has(r.stage))) return false;
        if (rf.owner.size && !(r.owner && rf.owner.has(r.owner))) return false;
        if (rf.region.size && !(r.region && rf.region.has(r.region))) return false;
        if (rf.state.size && !(r.state && rf.state.has(r.state))) return false;
        if (rf.from || rf.to) {
          // REUSE the shared contracted-date rule — never re-implement it.
          const d = recordDate(r);
          if (!d) return false;
          if (rf.from && d < rf.from) return false;
          if (rf.to && d > rf.to) return false;
        }
        return true;
      });
    }

    if (dsId === 'bd') {
      const B: any[] = Array.isArray((data as any).deals?.ranking?.bds) ? (data as any).deals.ranking.bds : [];
      const closers: any[] = Array.isArray((data as any).deals?.closers) ? (data as any).deals.closers : [];
      const closerMap = new Map(closers.map((c) => [c.bd, c]));
      const orgBds: Record<string, any> = (data as any).org?.bds || {};
      return B.filter((b) => {
        if (rf.owner.size && !rf.owner.has(b.bd)) return false;
        if (rf.region.size && !rf.region.has(b.region)) return false;
        return true;
      }).map((b) => ({
        ...b,
        signed: closerMap.get(b.bd)?.signed ?? 0,
        feeContracted: closerMap.get(b.bd)?.feeContracted ?? 0,
        email: orgBds[b.bd]?.email ?? '',
      }));
    }

    return proposalSummaryRows((data as any).proposals);
  }, [data, dsId, rf]);

  const activeColumns: ReportColumn[] = useMemo(() => {
    const on = new Set(cols);
    return def.columns.filter((c) => on.has(c.key));
  }, [def, cols]);

  const asOf = (data as any)?.deals?.generated || leadsAsOf || (data as any)?.generated || '—';
  const canDownload = rows.length > 0 && activeColumns.length > 0;

  /* -------------------- "Filters applied" documentation -------------------- */
  const filterSummary = useMemo(() => {
    const out: [string, string][] = [];
    out.push(['Report', `${def.label}${def.summaryOnly ? ' (summary only)' : ''}`]);
    out.push(['Generated', new Date().toLocaleString('en-IN')]);
    out.push(['Data as of', String(asOf)]);
    out.push(['Rows exported', String(rows.length)]);
    out.push(['Columns', activeColumns.map((c) => c.label).join(', ') || '(none)']);
    if (def.dateDim) {
      out.push(['Date range', rf.from || rf.to ? `${rf.from || 'start'} to ${rf.to || 'today'}` : 'All time']);
      if (activePresetLabel) out.push(['Date preset', activePresetLabel]);
    }
    def.dims.forEach((d) => {
      const s = rf[d] as Set<string>;
      out.push([DIM_LABEL[d], s.size ? Array.from(s).join(', ') : 'All']);
    });
    if (def.summaryOnly) out.push(['Note', 'Org-wide aggregates only — the feed carries no per-proposal rows.']);
    if (def.note) out.push(['Basis', def.note]);
    return out;
  }, [def, rf, rows.length, activeColumns, asOf, activePresetLabel]);

  /* -------------------- exports -------------------- */
  const csvColumns: CsvColumn[] = activeColumns.map((c) => ({ key: c.key, label: c.label, format: c.format }));
  const cellOf = (c: ReportColumn, r: any) => {
    const v = c.format ? c.format(r) : r?.[c.key];
    return v == null ? '' : v;
  };

  const exportCsv = () => {
    if (!canDownload) return;
    setBusy('csv');
    try {
      downloadCsv(reportFilename(dsId, rf, def, 'csv'), csvColumns, rows);
    } catch (e) {
      console.error('CSV export failed', e);
    } finally {
      setBusy(null);
    }
  };

  const exportExcel = async () => {
    if (!canDownload) return;
    setBusy('excel');
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      // Sheet 1 documents the exact filter set + row count + data-as-of stamp.
      const meta = XLSX.utils.aoa_to_sheet([['Field', 'Value'], ...filterSummary]);
      meta['!cols'] = [{ wch: 22 }, { wch: 90 }];
      XLSX.utils.book_append_sheet(wb, meta, 'Filters applied');
      const body = [activeColumns.map((c) => c.label), ...rows.map((r) => activeColumns.map((c) => cellOf(c, r)))];
      const ws = XLSX.utils.aoa_to_sheet(body);
      ws['!cols'] = activeColumns.map(() => ({ wch: 18 }));
      XLSX.utils.book_append_sheet(wb, ws, def.label.slice(0, 31));
      XLSX.writeFile(wb, reportFilename(dsId, rf, def, 'xlsx'));
    } catch (e) {
      console.error('Excel export failed', e);
    } finally {
      setBusy(null);
    }
  };

  const exportPdf = async () => {
    if (!canDownload) return;
    setBusy('pdf');
    try {
      const { jsPDF } = await import('jspdf');
      const autoTable = (await import('jspdf-autotable')).default;
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      const pink: [number, number, number] = [218, 26, 132];
      const pageW = doc.internal.pageSize.getWidth();

      doc.setFillColor(14, 14, 17);
      doc.rect(0, 0, pageW, 64, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text('Olive Hospitality', 40, 30);
      doc.setTextColor(...pink);
      doc.setFontSize(10.5);
      doc.text(`Business Development — ${def.label} report${def.summaryOnly ? ' (summary)' : ''}`, 40, 48);

      // Header block: the same "filters applied" record the Excel sheet carries.
      let y = 82;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(60, 60, 70);
      doc.text('Filters applied', 40, y);
      y += 13;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(90, 90, 100);
      filterSummary.forEach(([k, v]) => {
        const lines = doc.splitTextToSize(`${k}: ${v}`, pageW - 80) as string[];
        lines.forEach((ln) => {
          if (y > doc.internal.pageSize.getHeight() - 50) {
            doc.addPage();
            y = 50;
          }
          doc.text(ln, 40, y);
          y += 10;
        });
      });

      const capped = rows.length > PDF_ROW_CAP;
      if (capped) {
        doc.setTextColor(...pink);
        doc.text(
          `PDF capped at the first ${PDF_ROW_CAP.toLocaleString('en-IN')} of ${rows.length.toLocaleString('en-IN')} rows — use CSV or Excel for the complete set.`,
          40,
          y + 4
        );
        y += 14;
      }

      autoTable(doc, {
        head: [activeColumns.map((c) => c.label)],
        body: rows.slice(0, PDF_ROW_CAP).map((r) => activeColumns.map((c) => String(cellOf(c, r)))),
        startY: y + 8,
        margin: { left: 40, right: 40 },
        styles: { fontSize: 6.5, cellPadding: 2.5, textColor: [40, 40, 50], overflow: 'linebreak' },
        headStyles: { fillColor: pink, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 6.5 },
        alternateRowStyles: { fillColor: [245, 240, 248] },
      });

      doc.save(reportFilename(dsId, rf, def, 'pdf'));
    } catch (e) {
      console.error('PDF export failed', e);
    } finally {
      setBusy(null);
    }
  };

  if (!isOpen) return null;

  const previewRows = rows.slice(0, 10);
  const allOn = activeColumns.length === def.columns.length;

  return (
    <>
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60]" onClick={onClose} />
      <div className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center p-0 sm:p-6 pointer-events-none">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-builder-title"
          tabIndex={-1}
          className="pointer-events-auto w-full sm:max-w-5xl h-[100dvh] sm:h-auto sm:max-h-[92vh] bg-panel border border-border-subtle sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden focus:outline-none"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-border-subtle shrink-0">
            <div className="min-w-0">
              <h2 id="report-builder-title" className="text-base sm:text-lg font-semibold text-white flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-brand-pink-400 shrink-0" aria-hidden="true" />
                Create report
              </h2>
              <p className="text-[11px] text-text-secondary mt-0.5 truncate">
                Pick a dataset, refine the filters, choose columns, download.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close create report"
              className="p-2 rounded-lg hover:bg-surface text-text-secondary hover:text-white transition-colors cursor-pointer shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-400"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 flex flex-col gap-6 min-h-0">
            {/* 1 — dataset */}
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">1 · Dataset</span>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                {DATASETS.map((d) => {
                  const on = d.id === dsId;
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setDsId(d.id)}
                      aria-pressed={on}
                      className={clsx(
                        'flex flex-col items-start gap-0.5 px-3 py-2.5 rounded-xl border text-left transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-400 focus-visible:ring-offset-1 focus-visible:ring-offset-panel',
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
            </div>

            {/* 2 — filters */}
            <div className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">2 · Filters</span>
                <span className="text-[10px] text-text-secondary">
                  Independent of the page filters — seeded from them, changes here stay in the report.
                </span>
              </div>

              {def.dateDim ? (
                <div className="flex flex-col gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">Date range</span>
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
                            'px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all border cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-400 focus-visible:ring-offset-1 focus-visible:ring-offset-panel',
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
                      className="flex-1 min-w-0 bg-surface border border-border-subtle rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-brand-purple-400"
                    />
                    <input
                      type="date"
                      value={rf.to}
                      aria-label="Report end date"
                      onChange={(e) => setRange(rf.from, e.target.value)}
                      className="flex-1 min-w-0 bg-surface border border-border-subtle rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-brand-purple-400"
                    />
                  </div>
                </div>
              ) : (
                !def.summaryOnly && <p className="text-[11px] text-text-secondary italic">{def.note}</p>
              )}

              {def.dims.length > 0 ? (
                <div className="grid sm:grid-cols-2 gap-x-5 gap-y-4">
                  {def.dims.map((d) => (
                    <MultiSelectField
                      key={d}
                      label={DIM_LABEL[d]}
                      options={options[d]}
                      selected={rf[d] as Set<string>}
                      onToggle={(v) => toggleDim(d, v)}
                      onClear={() => clearDim(d)}
                      maxHeightClass="max-h-32"
                    />
                  ))}
                </div>
              ) : (
                !def.summaryOnly && <p className="text-[11px] text-text-secondary italic">No filter dimensions apply to this dataset.</p>
              )}
            </div>

            {/* 3 — columns */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
                  3 · Columns <span className="text-brand-pink-300 tabular-nums">({activeColumns.length}/{def.columns.length})</span>
                </span>
                <button
                  type="button"
                  onClick={() => setCols(allOn ? [] : def.columns.map((c) => c.key))}
                  className="text-[10px] font-semibold text-brand-pink-400 hover:text-brand-pink-300 underline underline-offset-2 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-400 rounded px-1"
                >
                  {allOn ? 'Select none' : 'Select all'}
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-1.5">
                {def.columns.map((c) => {
                  const on = cols.includes(c.key);
                  return (
                    <label
                      key={c.key}
                      className="flex items-center gap-2 text-[11px] text-text-secondary hover:text-white cursor-pointer min-w-0 py-0.5"
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() =>
                          setCols((prev) => (prev.includes(c.key) ? prev.filter((k) => k !== c.key) : [...prev, c.key]))
                        }
                        className="shrink-0 accent-[#da1a84] w-3.5 h-3.5 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-400"
                      />
                      <span className="truncate">{c.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* 4 — live preview */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">4 · Preview</span>
                <span aria-live="polite" className="text-[11px] text-white">
                  <strong className="text-brand-pink-300 tabular-nums">{rows.length.toLocaleString('en-IN')}</strong>{' '}
                  {def.summaryOnly ? 'summary rows' : `row${rows.length === 1 ? '' : 's'}`} · {activeColumns.length} column
                  {activeColumns.length === 1 ? '' : 's'}
                </span>
              </div>

              {rows.length === 0 || activeColumns.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border-subtle bg-surface/40 px-4 py-8 text-center">
                  <p className="text-sm font-semibold text-white">
                    {activeColumns.length === 0 ? 'No columns selected' : 'No rows match these filters'}
                  </p>
                  <p className="text-[11px] text-text-secondary mt-1">
                    {activeColumns.length === 0
                      ? 'Pick at least one column to include in the report.'
                      : 'Widen the date range or clear a dimension to get results. Downloads stay disabled until there is something to export.'}
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-border-subtle overflow-hidden">
                  <div className="overflow-x-auto max-h-64 overflow-y-auto">
                    <table className="w-full text-[11px] border-collapse">
                      <thead className="sticky top-0 bg-surface">
                        <tr>
                          {activeColumns.map((c) => (
                            <th
                              key={c.key}
                              scope="col"
                              className="text-left font-semibold text-text-secondary uppercase tracking-wider px-2.5 py-2 whitespace-nowrap border-b border-border-subtle"
                            >
                              {c.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((r, i) => (
                          <tr key={i} className="odd:bg-white/[0.02]">
                            {activeColumns.map((c) => (
                              <td key={c.key} className="px-2.5 py-1.5 text-white/90 whitespace-nowrap max-w-[220px] truncate">
                                {String(cellOf(c, r))}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {rows.length > previewRows.length && (
                    <p className="px-2.5 py-1.5 text-[10px] text-text-secondary bg-surface/60 border-t border-border-subtle">
                      Showing the first {previewRows.length} of {rows.length.toLocaleString('en-IN')} rows · data as of {String(asOf)}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t border-border-subtle bg-panel px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3">
            <p className="text-[10px] text-text-secondary min-w-0 truncate flex-1" title={reportFilename(dsId, rf, def, 'csv')}>
              {canDownload ? reportFilename(dsId, rf, def, 'csv') : 'Nothing to export yet'}
            </p>
            <div className="flex gap-2 shrink-0">
              <DownloadBtn onClick={exportCsv} disabled={!canDownload || busy !== null} busy={busy === 'csv'} icon={<Table2 className="w-3.5 h-3.5" />} label="CSV" />
              <DownloadBtn onClick={exportExcel} disabled={!canDownload || busy !== null} busy={busy === 'excel'} icon={<FileSpreadsheet className="w-3.5 h-3.5" />} label="Excel" />
              <DownloadBtn onClick={exportPdf} disabled={!canDownload || busy !== null} busy={busy === 'pdf'} icon={<FileText className="w-3.5 h-3.5" />} label="PDF" />
            </div>
          </div>
        </div>
      </div>
    </>
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
      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand-pink-500 text-[11px] font-bold text-white hover:bg-brand-pink-400 transition-colors shadow-[0_0_12px_rgba(218,26,132,0.35)] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-300 focus-visible:ring-offset-1 focus-visible:ring-offset-panel"
    >
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : icon}
      {label}
    </button>
  );
}

/** App-wide entry point — lives in the ContextBar, so it is on every route. */
export function ReportBuilderButton({ compact = false }: { compact?: boolean }) {
  const { data } = useDashboard();
  const [open, setOpen] = useState(false);
  if (!data) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Create a custom report"
        aria-haspopup="dialog"
        className={clsx(
          'flex items-center gap-2 rounded-lg bg-brand-pink-500/15 hover:bg-brand-pink-500/25 border border-brand-pink-500/40 transition-colors group shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-400 focus-visible:ring-offset-1 focus-visible:ring-offset-panel active:scale-95',
          compact ? 'px-2.5 py-1.5' : 'px-3 py-1.5'
        )}
      >
        <ClipboardList className="w-4 h-4 text-brand-pink-400" />
        <span className="text-xs font-semibold text-brand-pink-400 group-hover:text-brand-pink-300 whitespace-nowrap hidden sm:inline">
          Create report
        </span>
      </button>
      <ReportBuilder isOpen={open} onClose={() => setOpen(false)} />
    </>
  );
}
