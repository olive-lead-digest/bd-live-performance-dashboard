'use client';

import type { Filters } from './DashboardContext';
import { recordDate, type DealRecord } from './dealsRuntime';
import { inr, num, pct } from './format';
import { matrixToCsv, downloadCsvText, type CsvColumn } from './csv';

/* =====================================================================
 * reportEngine — the dataset, pivot and export core behind /reports.
 *
 * Extracted from the old ReportBuilder dialog (which this replaces) so the
 * dataset definitions, the contracted-date rule, the "Filters applied"
 * documentation block and the CSV / XLSX / PDF writers live in exactly ONE
 * place. The page is pure UI on top of this module.
 *
 * The pivot itself is deliberately dependency-free: a single pass over the
 * filtered rows accumulates every row-prefix x column-prefix bucket, so row
 * subtotals, column totals and the grand total all come out of the same
 * accumulation and can never disagree with each other.
 * ===================================================================== */

export type ReportDatasetId = 'leads' | 'deals' | 'bd' | 'proposals';
export type ReportDimKey =
  | 'brand' | 'status' | 'stage' | 'owner' | 'region' | 'state' | 'city' | 'cluster' | 'source';
export type AggId = 'count' | 'countDistinct' | 'sum' | 'avg' | 'min' | 'max';
export type FieldFormat = 'inr' | 'num' | 'pct' | 'text';
export type ZoneId = 'rows' | 'cols' | 'values' | 'filters';

/** Blank / missing dimension values are bucketed under this label, never dropped. */
export const BLANK = '(blank)';
/** Overflow bucket for dimensions past the cardinality cap — keeps totals exact. */
export const OTHER = '(other)';

/** A dimension used on Rows may contribute at most this many distinct values. */
export const MAX_ROW_DISTINCT = 200;
/** Columns are horizontally expensive, so they are capped harder. */
export const MAX_COL_DISTINCT = 30;
/** Hard ceiling on rendered body rows (the grand total still covers everything). */
export const MAX_BODY_ROWS = 300;
/** Hard ceiling on rendered value cells, so 15.6k leads can never hang the UI. */
export const MAX_CELLS = 20000;
/** PDF is a snapshot, not a data dump — cap it and say so. */
export const PDF_ROW_CAP = 2000;

export const AGGS: { id: AggId; label: string; numericOnly: boolean }[] = [
  { id: 'count', label: 'Count', numericOnly: false },
  { id: 'countDistinct', label: 'Count (distinct)', numericOnly: false },
  { id: 'sum', label: 'Sum', numericOnly: true },
  { id: 'avg', label: 'Average', numericOnly: true },
  { id: 'min', label: 'Min', numericOnly: true },
  { id: 'max', label: 'Max', numericOnly: true },
];

export const AGG_LABEL: Record<AggId, string> = {
  count: 'Count', countDistinct: 'Distinct', sum: 'Sum', avg: 'Avg', min: 'Min', max: 'Max',
};

/* ------------------------------------------------------------------ */
/* Fields                                                              */
/* ------------------------------------------------------------------ */

export interface PivotField {
  key: string;
  label: string;
  /** Grouping shown in the available-fields list. */
  group: 'Dimensions' | 'Dates' | 'Measures';
  numeric?: boolean;
  format?: FieldFormat;
  get: (row: any) => any;
}

export interface ReportColumn {
  key: string;
  label: string;
  format?: (row: any) => string | number | null | undefined;
}

export interface ValueSpec {
  /** Stable id so React keys survive reordering. */
  id: string;
  field: string;
  agg: AggId;
  /** User-supplied column label ('' = derive from field + agg). */
  label: string;
}

export interface PivotConfig {
  rows: string[];
  cols: string[];
  values: ValueSpec[];
}

export const emptyPivotConfig = (): PivotConfig => ({ rows: [], cols: [], values: [] });

/* ---- shared date derivations (ISO yyyy-mm-dd in, bucket label out) ---- */
const monthOf = (iso?: string | null) => (iso && iso.length >= 7 ? iso.slice(0, 7) : '');
const quarterOf = (iso?: string | null) => {
  if (!iso || iso.length < 7) return '';
  const m = Number(iso.slice(5, 7));
  return `${iso.slice(0, 4)} Q${Math.floor((m - 1) / 3) + 1}`;
};
const yearOf = (iso?: string | null) => (iso && iso.length >= 4 ? iso.slice(0, 4) : '');
/** Indian financial year (Apr–Mar), e.g. 2026-05-02 -> "FY26-27". */
const fyOf = (iso?: string | null) => {
  if (!iso || iso.length < 7) return '';
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const s = m >= 4 ? y : y - 1;
  return `FY${String(s).slice(2)}-${String(s + 1).slice(2)}`;
};

const yesNo = (v: any) => (v === true ? 'Yes' : v === false ? 'No' : '');
const nz = (v: any) => (v == null || v === '' ? '' : v);
export const normBrand = (b?: string) => String(b || '').trim() || 'Unknown';

/* ------------------------------------------------------------------ */
/* Dataset definitions                                                 */
/* ------------------------------------------------------------------ */

export interface DatasetDef {
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
  /** Fields offered to the pivot builder. */
  fields: PivotField[];
  /** Column set used by the RAW-rows export. */
  columns: ReportColumn[];
  /** Zones a one-click template starts from. */
  defaults: PivotConfig;
}

export const DIM_LABEL: Record<ReportDimKey, string> = {
  brand: 'Brand',
  status: 'Lead status',
  stage: 'Deal stage',
  owner: 'BD / owner',
  region: 'Region',
  state: 'State',
  city: 'City',
  cluster: 'Cluster',
  source: 'Lead source',
};

const RECORDS_FIELD: PivotField = {
  key: '__records', label: 'Records', group: 'Measures', numeric: false, format: 'num', get: () => 1,
};

const LEAD_FIELDS: PivotField[] = [
  { key: 'brand', label: 'Brand', group: 'Dimensions', get: (r) => r.brand },
  { key: 'status', label: 'Lead status', group: 'Dimensions', get: (r) => r.status || '(unassigned)' },
  { key: 'owner', label: 'BD / owner', group: 'Dimensions', get: (r) => r.owner },
  { key: 'source', label: 'Lead source', group: 'Dimensions', get: (r) => r.source },
  { key: 'region', label: 'Region', group: 'Dimensions', get: (r) => r.region },
  { key: 'state', label: 'State', group: 'Dimensions', get: (r) => r.state },
  { key: 'city', label: 'City', group: 'Dimensions', get: (r) => r.city },
  { key: 'cluster', label: 'Cluster', group: 'Dimensions', get: (r) => r.cluster },
  { key: 'dropReason', label: 'Drop reason', group: 'Dimensions', get: (r) => r.dropReason },
  { key: 'ci', label: 'Contact initiated', group: 'Dimensions', get: (r) => yesNo(r.ci) },
  { key: 'dt', label: 'Enquiry date', group: 'Dates', get: (r) => r.dt },
  { key: 'dtMonth', label: 'Enquiry month', group: 'Dates', get: (r) => monthOf(r.dt) },
  { key: 'dtQuarter', label: 'Enquiry quarter', group: 'Dates', get: (r) => quarterOf(r.dt) },
  { key: 'dtFy', label: 'Enquiry FY', group: 'Dates', get: (r) => fyOf(r.dt) },
  { key: 'dtYear', label: 'Enquiry year', group: 'Dates', get: (r) => yearOf(r.dt) },
  RECORDS_FIELD,
];

const DEAL_FIELDS: PivotField[] = [
  { key: 'brand', label: 'Brand', group: 'Dimensions', get: (r) => normBrand(r.brand) },
  { key: 'stage', label: 'Deal stage', group: 'Dimensions', get: (r) => r.stage },
  { key: 'stageType', label: 'Stage type', group: 'Dimensions', get: (r) => r.stageType },
  { key: 'owner', label: 'BD / owner', group: 'Dimensions', get: (r) => r.owner },
  { key: 'region', label: 'Region', group: 'Dimensions', get: (r) => r.region },
  { key: 'state', label: 'State', group: 'Dimensions', get: (r) => r.state },
  { key: 'signingProbability', label: 'Signing probability', group: 'Dimensions', get: (r) => r.signingProbability },
  { key: 'propertyType', label: 'Property type', group: 'Dimensions', get: (r) => r.propertyType },
  { key: 'landStatus', label: 'Land status', group: 'Dimensions', get: (r) => r.landStatus },
  { key: 'name', label: 'Deal name', group: 'Dimensions', get: (r) => r.name },
  { key: 'contractedDate', label: 'Contracted / expected date', group: 'Dates', get: (r) => recordDate(r as DealRecord) },
  { key: 'contractedMonth', label: 'Contracted month', group: 'Dates', get: (r) => monthOf(recordDate(r as DealRecord)) },
  { key: 'contractedQuarter', label: 'Contracted quarter', group: 'Dates', get: (r) => quarterOf(recordDate(r as DealRecord)) },
  { key: 'contractedFy', label: 'Contracted FY', group: 'Dates', get: (r) => fyOf(recordDate(r as DealRecord)) },
  { key: 'maMonth', label: 'MA-signed month', group: 'Dates', get: (r) => monthOf(r.maDate) },
  { key: 'keys', label: 'Keys', group: 'Measures', numeric: true, format: 'num', get: (r) => Number(r.keys) || 0 },
  { key: 'feeContracted', label: 'TA fee contracted', group: 'Measures', numeric: true, format: 'inr', get: (r) => Number(r.feeContracted) || 0 },
  { key: 'feeCollected', label: 'TA fee collected', group: 'Measures', numeric: true, format: 'inr', get: (r) => Number(r.feeCollected) || 0 },
  { key: 'feePending', label: 'TA fee pending', group: 'Measures', numeric: true, format: 'inr', get: (r) => Number(r.feePending) || 0 },
  RECORDS_FIELD,
];

const BD_FIELDS: PivotField[] = [
  { key: 'bd', label: 'BD', group: 'Dimensions', get: (r) => r.bd },
  { key: 'region', label: 'Region', group: 'Dimensions', get: (r) => r.region },
  { key: 'regionHead', label: 'Region head', group: 'Dimensions', get: (r) => r.regionHead },
  { key: 'ytdTarget', label: 'YTD target', group: 'Measures', numeric: true, format: 'num', get: (r) => Number(r.ytdTarget) || 0 },
  { key: 'ytdAchievement', label: 'YTD achieved', group: 'Measures', numeric: true, format: 'num', get: (r) => Number(r.ytdAchievement) || 0 },
  { key: 'achievementPct', label: 'Achievement %', group: 'Measures', numeric: true, format: 'pct', get: (r) => Number(r.achievementPct) || 0 },
  { key: 'signed', label: 'MA signed (all-time)', group: 'Measures', numeric: true, format: 'num', get: (r) => Number(r.signed) || 0 },
  { key: 'feeContracted', label: 'TA fee contracted (all-time)', group: 'Measures', numeric: true, format: 'inr', get: (r) => Number(r.feeContracted) || 0 },
  RECORDS_FIELD,
];

const PROPOSAL_FIELDS: PivotField[] = [
  { key: 'section', label: 'Section', group: 'Dimensions', get: (r) => r.section },
  { key: 'item', label: 'Item', group: 'Dimensions', get: (r) => r.item },
  { key: 'metric', label: 'Metric', group: 'Dimensions', get: (r) => r.metric },
  { key: 'value', label: 'Value', group: 'Measures', numeric: true, format: 'num', get: (r) => (typeof r.value === 'number' ? r.value : Number(r.value) || 0) },
  RECORDS_FIELD,
];

export const DATASETS: DatasetDef[] = [
  {
    id: 'leads',
    label: 'Leads',
    blurb: 'One row per lead enquiry',
    dims: ['brand', 'status', 'owner', 'source', 'region', 'state', 'city', 'cluster'],
    dateDim: true,
    note: 'Date range filters leads on their enquiry date (dt).',
    fields: LEAD_FIELDS,
    defaults: {
      rows: ['region'],
      cols: [],
      values: [{ id: 'v1', field: '__records', agg: 'count', label: 'Leads' }],
    },
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
    fields: DEAL_FIELDS,
    defaults: {
      rows: ['owner'],
      cols: ['brand'],
      values: [{ id: 'v1', field: 'feeContracted', agg: 'sum', label: '' }],
    },
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
    fields: BD_FIELDS,
    defaults: {
      rows: ['region'],
      cols: [],
      values: [
        { id: 'v1', field: 'ytdTarget', agg: 'sum', label: '' },
        { id: 'v2', field: 'ytdAchievement', agg: 'sum', label: '' },
      ],
    },
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
      'The proposals feed publishes org-wide aggregates ONLY — there are no per-proposal records, so this dataset pivots the published summary and filters do not apply.',
    fields: PROPOSAL_FIELDS,
    defaults: {
      rows: ['item'],
      cols: ['metric'],
      values: [{ id: 'v1', field: 'value', agg: 'sum', label: '' }],
    },
    columns: [
      { key: 'section', label: 'Section' },
      { key: 'item', label: 'Item' },
      { key: 'metric', label: 'Metric' },
      { key: 'value', label: 'Value' },
    ],
  },
];

export const datasetById = (id: ReportDatasetId): DatasetDef =>
  DATASETS.find((d) => d.id === id) || DATASETS[0];

export const fieldByKey = (def: DatasetDef, key: string): PivotField | undefined =>
  def.fields.find((f) => f.key === key);

/* ------------------------------------------------------------------ */
/* Filter state                                                        */
/* ------------------------------------------------------------------ */

export interface ReportFilterState {
  from: string;
  to: string;
  presetLabel: string;
  brand: Set<string>;
  status: Set<string>;
  stage: Set<string>;
  owner: Set<string>;
  source: Set<string>;
  region: Set<string>;
  state: Set<string>;
  city: Set<string>;
  cluster: Set<string>;
}

export function emptyReportFilters(): ReportFilterState {
  return {
    from: '', to: '', presetLabel: '',
    brand: new Set(), status: new Set(), stage: new Set(), owner: new Set(), source: new Set(),
    region: new Set(), state: new Set(), city: new Set(), cluster: new Set(),
  };
}

/** Seed the page from the dashboard's global filters so it feels continuous. */
export function seedFromGlobal(f: Filters): ReportFilterState {
  return {
    from: f.from,
    to: f.to,
    presetLabel: f.presetLabel,
    brand: new Set(f.brand),
    status: new Set(f.status),
    stage: new Set(),
    owner: new Set(f.owner),
    source: new Set(),
    region: new Set(f.region),
    state: new Set(f.state),
    city: new Set(f.city),
    cluster: new Set(f.cluster),
  };
}

export function anyReportFilter(rf: ReportFilterState, def: DatasetDef): boolean {
  if (def.dateDim && (rf.from || rf.to)) return true;
  return def.dims.some((d) => (rf[d] as Set<string>).size > 0);
}

/* ------------------------------------------------------------------ */
/* Option lists + row selection                                        */
/* ------------------------------------------------------------------ */

const uniqSorted = (xs: (string | null | undefined)[]): string[] =>
  Array.from(new Set(xs.filter((x): x is string => !!x && !!String(x).trim()))).sort((a, b) =>
    a.localeCompare(b)
  );

export function filterOptions(data: any, dsId: ReportDatasetId): Record<ReportDimKey, string[]> {
  const o: Record<ReportDimKey, string[]> = {
    brand: [], status: [], stage: [], owner: [], source: [], region: [], state: [], city: [], cluster: [],
  };
  if (!data) return o;
  if (dsId === 'leads') {
    const L: any[] = data.leads || [];
    o.brand = uniqSorted(L.map((l) => l.brand));
    o.status = uniqSorted(L.map((l) => l.status || '(unassigned)'));
    o.owner = uniqSorted(L.map((l) => l.owner));
    o.source = uniqSorted(L.map((l) => l.source));
    o.region = uniqSorted(L.map((l) => l.region));
    o.state = uniqSorted(L.map((l) => l.state));
    o.city = uniqSorted(L.map((l) => l.city));
    o.cluster = uniqSorted(L.map((l) => l.cluster));
  } else if (dsId === 'deals') {
    const R: DealRecord[] = Array.isArray(data?.deals?.records) ? data.deals.records : [];
    o.brand = uniqSorted(R.map((r) => normBrand(r.brand)));
    o.stage = uniqSorted(R.map((r) => r.stage));
    o.owner = uniqSorted(R.map((r) => r.owner));
    o.region = uniqSorted(R.map((r) => r.region));
    o.state = uniqSorted(R.map((r) => r.state));
  } else if (dsId === 'bd') {
    const B: any[] = Array.isArray(data?.deals?.ranking?.bds) ? data.deals.ranking.bds : [];
    o.owner = uniqSorted(B.map((b) => b.bd));
    o.region = uniqSorted(B.map((b) => b.region));
  }
  return o;
}

/** Org-wide proposal aggregates flattened to rows — never per-proposal records. */
export function proposalSummaryRows(p: any): any[] {
  if (!p) return [];
  const out: { section: string; item: string; metric: string; value: number | string }[] = [];
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

/** The filtered underlying rows for a dataset — the pivot's and raw export's input. */
export function selectRows(data: any, dsId: ReportDatasetId, rf: ReportFilterState): any[] {
  if (!data) return [];

  if (dsId === 'leads') {
    return (data.leads || []).filter((l: any) => {
      if (rf.from && l.dt < rf.from) return false;
      if (rf.to && l.dt > rf.to) return false;
      if (rf.brand.size && !rf.brand.has(l.brand)) return false;
      if (rf.status.size && !rf.status.has(l.status || '(unassigned)')) return false;
      if (rf.owner.size && !(l.owner && rf.owner.has(l.owner))) return false;
      if (rf.source.size && !(l.source && rf.source.has(l.source))) return false;
      if (rf.region.size && !rf.region.has(l.region)) return false;
      if (rf.state.size && !rf.state.has(l.state)) return false;
      if (rf.city.size && !rf.city.has(l.city)) return false;
      if (rf.cluster.size && !rf.cluster.has(l.cluster)) return false;
      return true;
    });
  }

  if (dsId === 'deals') {
    const R: DealRecord[] = Array.isArray(data?.deals?.records) ? data.deals.records : [];
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
    const B: any[] = Array.isArray(data?.deals?.ranking?.bds) ? data.deals.ranking.bds : [];
    const closers: any[] = Array.isArray(data?.deals?.closers) ? data.deals.closers : [];
    const closerMap = new Map(closers.map((c) => [c.bd, c]));
    const orgBds: Record<string, any> = data?.org?.bds || {};
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

  return proposalSummaryRows(data?.proposals);
}

/* ==================================================================
 * The pivot engine
 *
 * ONE pass over the filtered rows accumulates every (row-prefix x
 * column-leaf) and (row-prefix x all-columns) bucket. Row subtotals, the
 * Total column and the Grand total are therefore read out of the same
 * accumulation as the leaf cells and can never disagree.
 * ================================================================== */

// Separators that cannot occur inside a real dimension value, so a path like
// ['North', 'Olive'] can never collide with a value literally called 'NorthOlive'.
// Built with fromCharCode (not an escape sequence or a raw control byte) so the
// source stays plain ASCII and byte-stable through any transport.
const SEP = String.fromCharCode(1); // joins the parts of a row/column path
const AXIS = String.fromCharCode(2); // joins the row key to the column key

export interface PivotCell {
  text: string;
  /** Raw value — numbers stay numbers so Excel gets real numerics. */
  v?: number | string | null;
  span?: number;
  numeric?: boolean;
  totalCol?: boolean;
}

export interface PivotRowMeta {
  kind: 'data' | 'subtotal' | 'grand';
  depth: number;
}

export interface PivotMatrix {
  header: PivotCell[][];
  body: PivotCell[][];
  meta: PivotRowMeta[];
  /** Expanded (span-aware) column count. */
  colCount: number;
  /** Number of leading row-label columns. */
  labelCols: number;
  /** Header labels of the row-label columns. */
  rowFieldLabels: string[];
}

export interface PivotResult {
  matrix: PivotMatrix | null;
  warnings: string[];
  /** Body rows actually rendered (excluding the grand-total row). */
  bodyRows: number;
  /** Body rows before any cap was applied. */
  bodyRowsTotal: number;
  colGroups: number;
  valueCount: number;
  /** Grand total per value spec — the number the Grand total row shows. */
  grandTotals: (number | null)[];
  recordCount: number;
  truncated: boolean;
}

interface Acc {
  count: number;
  n: number;
  sum: number;
  min: number;
  max: number;
  distinct?: Set<string>;
}

const dimText = (v: any): string => {
  const s = v == null ? '' : String(v).trim();
  return s === '' ? BLANK : s;
};

const cmpLabel = (a: string, b: string): number => {
  // "(blank)" and "(other)" always sort last, whatever the alphabet says.
  const rank = (s: string) => (s === OTHER ? 2 : s === BLANK ? 1 : 0);
  const r = rank(a) - rank(b);
  return r !== 0 ? r : a.localeCompare(b, 'en');
};

const resolveAcc = (a: Acc | undefined, agg: AggId): number | null => {
  if (!a) return null;
  switch (agg) {
    case 'count':
      return a.count;
    case 'countDistinct':
      return a.distinct ? a.distinct.size : 0;
    case 'sum':
      return a.n ? a.sum : a.count ? 0 : null;
    case 'avg':
      return a.n ? a.sum / a.n : null;
    case 'min':
      return a.n ? a.min : null;
    case 'max':
      return a.n ? a.max : null;
    default:
      return null;
  }
};

/** Display text for one aggregated number, using the shared ₹ Lakh/Crore + Indian separators. */
export function formatValue(v: number | null, agg: AggId, field: PivotField): string {
  if (v == null || !Number.isFinite(v)) return '';
  if (agg === 'count' || agg === 'countDistinct') return num(v);
  if (field.format === 'inr') return inr(v);
  if (field.format === 'pct') return agg === 'avg' ? `${v.toFixed(1)}%` : pct(v);
  if (agg === 'avg') return v.toLocaleString('en-IN', { maximumFractionDigits: 1 });
  return num(v);
}

/** The column heading for a value spec — the user's label wins. */
export function valueLabel(spec: ValueSpec, field: PivotField | undefined): string {
  const custom = (spec.label || '').trim();
  if (custom) return custom;
  if (!field) return spec.field;
  if (field.key === '__records') return spec.agg === 'count' ? 'Records' : `${AGG_LABEL[spec.agg]} of records`;
  return `${AGG_LABEL[spec.agg]} of ${field.label}`;
}

/** Aggregations that make sense for a field (non-numeric fields cannot be summed). */
export const aggsFor = (field?: PivotField): AggId[] =>
  AGGS.filter((a) => !a.numericOnly || !!field?.numeric).map((a) => a.id);

/** Default aggregation: numeric fields Sum, everything else Count. */
export const defaultAgg = (field?: PivotField): AggId => (field?.numeric ? 'sum' : 'count');

export function computePivot(
  rows: any[],
  def: DatasetDef,
  cfg: PivotConfig,
  sortRowsByTotal = true
): PivotResult {
  const warnings: string[] = [];
  const specs = cfg.values
    .map((spec) => ({ spec, field: fieldByKey(def, spec.field) }))
    .filter((x): x is { spec: ValueSpec; field: PivotField } => !!x.field);

  const empty: PivotResult = {
    matrix: null, warnings, bodyRows: 0, bodyRowsTotal: 0, colGroups: 0,
    valueCount: specs.length, grandTotals: [], recordCount: rows.length, truncated: false,
  };
  if (!specs.length) return empty;

  const rowFields = cfg.rows.map((k) => fieldByKey(def, k)).filter((f): f is PivotField => !!f);
  const colFields = cfg.cols.map((k) => fieldByKey(def, k)).filter((f): f is PivotField => !!f);
  const R = rowFields.length;
  const C = colFields.length;

  /* --- cardinality guard: top-N + an "(other)" bucket, so totals stay exact --- */
  const bucketer = (f: PivotField, cap: number, where: string): ((row: any) => string) => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      const k = dimText(f.get(r));
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    if (counts.size <= cap) return (row: any) => dimText(f.get(row));
    const keep = new Set(
      Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, cap).map((e) => e[0])
    );
    warnings.push(
      `${f.label} has ${counts.size.toLocaleString('en-IN')} distinct values on ${where} — the top ${cap} are shown and the rest are bucketed into ${OTHER}. Totals still cover every row.`
    );
    return (row: any) => {
      const k = dimText(f.get(row));
      return keep.has(k) ? k : OTHER;
    };
  };

  const rowGet = rowFields.map((f) => bucketer(f, MAX_ROW_DISTINCT, 'Rows'));
  const colGet = colFields.map((f) => bucketer(f, MAX_COL_DISTINCT, 'Columns'));

  /* --- accumulate --- */
  const store = new Map<string, Acc[]>();
  const rowPaths = new Map<string, string[]>();
  const colPaths = new Map<string, string[]>();

  const newAccs = (): Acc[] =>
    specs.map((s) => ({
      count: 0, n: 0, sum: 0, min: Infinity, max: -Infinity,
      distinct: s.spec.agg === 'countDistinct' ? new Set<string>() : undefined,
    }));

  const bump = (key: string, row: any) => {
    let accs = store.get(key);
    if (!accs) {
      accs = newAccs();
      store.set(key, accs);
    }
    for (let i = 0; i < specs.length; i++) {
      const { spec, field } = specs[i];
      const a = accs[i];
      a.count++;
      if (spec.agg === 'count') continue;
      const raw = field.get(row);
      if (spec.agg === 'countDistinct') {
        const s = raw == null ? '' : String(raw).trim();
        if (s) a.distinct!.add(s);
        continue;
      }
      const nv = typeof raw === 'number' ? raw : Number(raw);
      if (raw == null || raw === '' || !Number.isFinite(nv)) continue;
      a.n++;
      a.sum += nv;
      if (nv < a.min) a.min = nv;
      if (nv > a.max) a.max = nv;
    }
  };

  for (const row of rows) {
    const rp = rowGet.map((g) => g(row));
    const cp = colGet.map((g) => g(row));
    const colLeaf = cp.join(SEP);
    if (C) colPaths.set(colLeaf, cp);
    for (let d = 0; d <= R; d++) {
      const rk = d === 0 ? '' : rp.slice(0, d).join(SEP);
      if (d > 0 && !rowPaths.has(rk)) rowPaths.set(rk, rp.slice(0, d));
      bump(rk + AXIS, row); // the "Total" column (all columns)
      if (C) bump(rk + AXIS + colLeaf, row);
    }
  }

  const grandTotals = specs.map((s, i) => resolveAcc(store.get(AXIS)?.[i], s.spec.agg));

  /* --- ordered column groups (leaves in lexicographic path order, then Total) --- */
  const colLeaves: string[][] = [];
  colPaths.forEach((p) => colLeaves.push(p));
  colLeaves.sort((a, b) => {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const c = cmpLabel(a[i] ?? '', b[i] ?? '');
      if (c) return c;
    }
    return 0;
  });
  interface ColGroup { path: string[]; key: string; isTotal: boolean }
  const colGroups: ColGroup[] = C
    ? [
        ...colLeaves.map((p) => ({ path: p, key: p.join(SEP), isTotal: false })),
        { path: [], key: '', isTotal: true },
      ]
    : [{ path: [], key: '', isTotal: false }];

  /* --- ordered row tree --- */
  interface RNode { label: string; key: string; depth: number; children: RNode[] }
  const leafPaths: string[][] = [];
  rowPaths.forEach((p) => {
    if (p.length === R) leafPaths.push(p);
  });

  const sortScore = (key: string): number => {
    const accs = store.get(key + AXIS);
    if (!accs) return 0;
    const v = resolveAcc(accs[0], specs[0].spec.agg);
    return v == null ? 0 : v;
  };

  const buildNodes = (paths: string[][], depth: number): RNode[] => {
    const groups = new Map<string, string[][]>();
    for (const p of paths) {
      const k = p[depth];
      const bucket = groups.get(k);
      if (bucket) bucket.push(p);
      else groups.set(k, [p]);
    }
    const out: RNode[] = [];
    groups.forEach((ps, label) => {
      const key = ps[0].slice(0, depth + 1).join(SEP);
      out.push({
        label, key, depth,
        children: depth + 1 < R ? buildNodes(ps, depth + 1) : [],
      });
    });
    out.sort((a, b) => {
      if (sortRowsByTotal) {
        const d = sortScore(b.key) - sortScore(a.key);
        if (d) return d;
      }
      return cmpLabel(a.label, b.label);
    });
    return out;
  };

  const tree = R ? buildNodes(leafPaths, 0) : [];

  /* --- flatten to body rows --- */
  interface RowPlan { key: string; label: string; depth: number; kind: 'data' | 'subtotal' }
  const plan: RowPlan[] = [];
  const walk = (nodes: RNode[]) => {
    for (const n of nodes) {
      const isLeaf = n.children.length === 0;
      plan.push({ key: n.key, label: n.label, depth: n.depth, kind: isLeaf ? 'data' : 'subtotal' });
      if (!isLeaf) walk(n.children);
    }
  };
  walk(tree);

  const bodyRowsTotal = R ? plan.length : 1;
  const perRowCells = colGroups.length * specs.length;
  const cellCap = Math.max(1, Math.floor(MAX_CELLS / Math.max(1, perRowCells)));
  const cap = Math.min(MAX_BODY_ROWS, cellCap);
  const truncated = R > 0 && plan.length > cap;
  const shownPlan = truncated ? plan.slice(0, cap) : plan;
  if (truncated) {
    warnings.push(
      `${plan.length.toLocaleString('en-IN')} row groups matched — the first ${cap.toLocaleString('en-IN')} are shown (sorted ${sortRowsByTotal ? 'by total' : 'A→Z'}). The Grand total still covers every matching row.`
    );
  }

  /* --- header --- */
  const labelCols = Math.max(R, 1);
  const rowFieldLabels = R ? rowFields.map((f) => f.label) : ['All records'];
  const header: PivotCell[][] = [];
  const blank = (n: number): PivotCell[] => Array.from({ length: n }, () => ({ text: '' }));
  const singleValue = specs.length === 1;
  // With one value the last column level shares the row-field header row (Excel's
  // compact layout); with several, every level gets its own row and the value
  // labels sit underneath.
  const groupingLevels = singleValue ? C - 1 : C;

  for (let lvl = 0; lvl < groupingLevels; lvl++) {
    const cells: PivotCell[] = blank(labelCols);
    cells[0] = { text: `${colFields[lvl].label} →` };
    let i = 0;
    while (i < colGroups.length) {
      const g = colGroups[i];
      if (g.isTotal) {
        cells.push({ text: 'Total', span: specs.length, totalCol: true });
        i++;
        continue;
      }
      let j = i;
      while (
        j + 1 < colGroups.length &&
        !colGroups[j + 1].isTotal &&
        colGroups[j + 1].path.slice(0, lvl + 1).join(SEP) === g.path.slice(0, lvl + 1).join(SEP)
      ) j++;
      cells.push({ text: g.path[lvl], span: (j - i + 1) * specs.length });
      i = j + 1;
    }
    header.push(cells);
  }

  const last: PivotCell[] = rowFieldLabels.map((t) => ({ text: t }));
  if (singleValue) {
    if (C) {
      for (const g of colGroups) {
        if (g.isTotal) last.push({ text: 'Total', totalCol: true });
        else last.push({ text: g.path[C - 1] });
      }
    } else {
      last.push({ text: valueLabel(specs[0].spec, specs[0].field) });
    }
  } else {
    for (const g of colGroups) {
      for (const s of specs) {
        last.push({ text: valueLabel(s.spec, s.field), totalCol: g.isTotal });
      }
    }
  }
  header.push(last);

  /* --- body --- */
  const valueCells = (rowKey: string): PivotCell[] => {
    const out: PivotCell[] = [];
    for (const g of colGroups) {
      const accs = store.get(rowKey + AXIS + g.key);
      for (let i = 0; i < specs.length; i++) {
        const { spec, field } = specs[i];
        const v = resolveAcc(accs?.[i], spec.agg);
        out.push({
          text: formatValue(v, spec.agg, field),
          v: v == null ? null : Math.round(v * 100) / 100,
          numeric: true,
          totalCol: g.isTotal,
        });
      }
    }
    return out;
  };

  const body: PivotCell[][] = [];
  const meta: PivotRowMeta[] = [];

  if (!R) {
    body.push([{ text: 'All records' }, ...valueCells('')]);
    meta.push({ kind: 'data', depth: 0 });
  } else {
    for (const p of shownPlan) {
      const labels = blank(labelCols);
      labels[p.depth] = { text: p.label };
      body.push([...labels, ...valueCells(p.key)]);
      meta.push({ kind: p.kind, depth: p.depth });
    }
    const grand = blank(labelCols);
    grand[0] = { text: 'Grand total' };
    body.push([...grand, ...valueCells('')]);
    meta.push({ kind: 'grand', depth: 0 });
  }

  const colCount = labelCols + colGroups.length * specs.length;

  return {
    matrix: { header, body, meta, colCount, labelCols, rowFieldLabels },
    warnings,
    bodyRows: R ? shownPlan.length : 1,
    bodyRowsTotal,
    colGroups: colGroups.length,
    valueCount: specs.length,
    grandTotals,
    recordCount: rows.length,
    truncated,
  };
}

/** Flatten a span-aware header/body row into one text cell per physical column. */
export function expandRow(cells: PivotCell[], colCount: number): string[] {
  const out: string[] = [];
  for (const c of cells) {
    out.push(c.text);
    for (let i = 1; i < (c.span || 1); i++) out.push('');
  }
  while (out.length < colCount) out.push('');
  return out.slice(0, colCount);
}

/** Span-aware flatten that keeps numbers as numbers (for the Excel writer). */
function expandRowRaw(cells: PivotCell[], colCount: number): (string | number | null)[] {
  const out: (string | number | null)[] = [];
  for (const c of cells) {
    out.push(c.v === undefined ? c.text : c.v);
    for (let i = 1; i < (c.span || 1); i++) out.push('');
  }
  while (out.length < colCount) out.push('');
  return out.slice(0, colCount);
}

/* ==================================================================
 * Filenames, the "Filters applied" record, and the exports
 * ================================================================== */

const FILENAME_BASE: Record<ReportDatasetId, string> = {
  leads: 'leads',
  deals: 'deals',
  bd: 'bd-performance',
  proposals: 'proposals-summary',
};

/** Slugify ONE value. Applied per value (not to the joined string) so a value
 *  like "South 1 (KA)" becomes "south-1-ka" — never "south-1-ka-". */
const slug = (s: string): string =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export function reportFilename(
  dsId: ReportDatasetId,
  rf: ReportFilterState,
  def: DatasetDef,
  ext: string,
  kind: 'pivot' | 'raw' = 'pivot'
): string {
  const parts: string[] = [FILENAME_BASE[dsId], kind];
  (['brand', 'stage', 'status', 'owner', 'source', 'region', 'state', 'city', 'cluster'] as const).forEach((k) => {
    if (!def.dims.includes(k as ReportDimKey)) return;
    const s = rf[k];
    if (!s || !s.size) return;
    const joined = Array.from(s).map(slug).filter(Boolean).join('-');
    if (joined) parts.push(joined);
  });
  if (def.dateDim && (rf.from || rf.to)) parts.push(`${rf.from || 'start'}_${rf.to || 'today'}`);
  else parts.push(new Date().toISOString().slice(0, 10));
  const base = parts
    .filter(Boolean)
    .join('_')
    .replace(/-{2,}/g, '-')
    .replace(/_{2,}/g, '_')
    .replace(/[-_]+$/g, '')
    .replace(/^[-_]+/g, '');
  return `${base}.${ext}`;
}

export interface SummaryInput {
  def: DatasetDef;
  rf: ReportFilterState;
  cfg: PivotConfig;
  result: PivotResult;
  rawRowCount: number;
  asOf: string;
  presetLabel: string;
  kind: 'pivot' | 'raw';
}

/** The exact filter record that rides along with every export. */
export function buildFilterSummary(inp: SummaryInput): [string, string][] {
  const { def, rf, cfg, result, rawRowCount, asOf, presetLabel, kind } = inp;
  const out: [string, string][] = [];
  const fieldLabel = (k: string) => fieldByKey(def, k)?.label || k;
  out.push(['Report', `${def.label} — ${kind === 'raw' ? 'raw filtered rows' : 'pivot table'}${def.summaryOnly ? ' (summary only)' : ''}`]);
  out.push(['Generated', new Date().toLocaleString('en-IN')]);
  out.push(['Data as of', String(asOf)]);
  out.push(['Rows matching filters', rawRowCount.toLocaleString('en-IN')]);
  if (kind === 'pivot') {
    out.push(['Pivot rows', cfg.rows.map(fieldLabel).join(' › ') || '(none)']);
    out.push(['Pivot columns', cfg.cols.map(fieldLabel).join(' › ') || '(none)']);
    out.push([
      'Pivot values',
      cfg.values.map((v) => valueLabel(v, fieldByKey(def, v.field))).join(', ') || '(none)',
    ]);
    out.push([
      'Pivot size',
      `${result.bodyRows.toLocaleString('en-IN')} body row${result.bodyRows === 1 ? '' : 's'} × ${result.colGroups} column group${result.colGroups === 1 ? '' : 's'} (+ totals)`,
    ]);
  }
  if (def.dateDim) {
    out.push(['Date range', rf.from || rf.to ? `${rf.from || 'start'} to ${rf.to || 'today'}` : 'All time']);
    if (presetLabel) out.push(['Date preset', presetLabel]);
  }
  def.dims.forEach((d) => {
    const s = rf[d] as Set<string>;
    out.push([DIM_LABEL[d], s.size ? Array.from(s).join(', ') : 'All']);
  });
  result.warnings.forEach((w, i) => out.push([`Note ${i + 1}`, w]));
  if (def.summaryOnly) out.push(['Note', 'Org-wide aggregates only — the feed carries no per-proposal rows.']);
  if (def.note) out.push(['Basis', def.note]);
  return out;
}

const cellOf = (c: ReportColumn, r: any) => {
  const v = c.format ? c.format(r) : r?.[c.key];
  return v == null ? '' : v;
};

/** The pivot, exactly as displayed (headers, subtotals, totals, grand total). */
export function pivotToRows(matrix: PivotMatrix): string[][] {
  return [
    ...matrix.header.map((r) => expandRow(r, matrix.colCount)),
    ...matrix.body.map((r) => expandRow(r, matrix.colCount)),
  ];
}

export function exportPivotCsv(matrix: PivotMatrix, filename: string): void {
  downloadCsvText(filename, matrixToCsv(pivotToRows(matrix)));
}

export function exportRawCsv(columns: ReportColumn[], rows: any[], filename: string): void {
  const cols: CsvColumn[] = columns.map((c) => ({ key: c.key, label: c.label, format: c.format }));
  downloadCsvText(filename, matrixToCsv([cols.map((c) => c.label), ...rows.map((r) => cols.map((c) => cellOf(c as ReportColumn, r)))]));
}

export interface ExcelInput {
  filename: string;
  filterSummary: [string, string][];
  matrix: PivotMatrix | null;
  sheetName: string;
  raw?: { columns: ReportColumn[]; rows: any[] } | null;
}

export async function exportExcel(inp: ExcelInput): Promise<void> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();

  // Sheet 1 documents the exact filter set + row count + data-as-of stamp.
  const meta = XLSX.utils.aoa_to_sheet([['Field', 'Value'], ...inp.filterSummary]);
  meta['!cols'] = [{ wch: 24 }, { wch: 96 }];
  XLSX.utils.book_append_sheet(wb, meta, 'Filters applied');

  if (inp.matrix) {
    const aoa = [
      ...inp.matrix.header.map((r) => expandRow(r, inp.matrix!.colCount)),
      ...inp.matrix.body.map((r) => expandRowRaw(r, inp.matrix!.colCount)),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa as any[][]);
    ws['!cols'] = Array.from({ length: inp.matrix.colCount }, (_, i) => ({ wch: i < inp.matrix!.labelCols ? 26 : 16 }));
    XLSX.utils.book_append_sheet(wb, ws, 'Pivot');
  }

  if (inp.raw) {
    const cols = inp.raw.columns;
    const body = [cols.map((c) => c.label), ...inp.raw.rows.map((r) => cols.map((c) => cellOf(c, r)))];
    const ws = XLSX.utils.aoa_to_sheet(body as any[][]);
    ws['!cols'] = cols.map(() => ({ wch: 18 }));
    XLSX.utils.book_append_sheet(wb, ws, 'Raw');
  }

  XLSX.writeFile(wb, inp.filename);
}

export interface PdfInput {
  filename: string;
  title: string;
  subtitle: string;
  filterSummary: [string, string][];
  head: string[][];
  body: string[][];
  /** Rows dropped from the PDF because of the snapshot cap (0 = none). */
  cappedFrom?: number;
}

export async function exportPdf(inp: PdfInput): Promise<void> {
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
  doc.setTextColor(pink[0], pink[1], pink[2]);
  doc.setFontSize(10.5);
  doc.text(inp.subtitle, 40, 48);

  // Header block: the same "filters applied" record the Excel sheet carries.
  let y = 82;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 70);
  doc.text(inp.title, 40, y);
  y += 13;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(90, 90, 100);
  inp.filterSummary.forEach(([k, v]) => {
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

  if (inp.cappedFrom) {
    doc.setTextColor(pink[0], pink[1], pink[2]);
    doc.text(
      `PDF capped at the first ${PDF_ROW_CAP.toLocaleString('en-IN')} of ${inp.cappedFrom.toLocaleString('en-IN')} rows — use CSV or Excel for the complete set.`,
      40,
      y + 4
    );
    y += 14;
  }

  autoTable(doc, {
    head: inp.head,
    body: inp.body,
    startY: y + 8,
    margin: { left: 40, right: 40 },
    styles: { fontSize: 6.5, cellPadding: 2.5, textColor: [40, 40, 50], overflow: 'linebreak' },
    headStyles: { fillColor: pink, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 6.5 },
    alternateRowStyles: { fillColor: [245, 240, 248] },
  });

  doc.save(inp.filename);
}

/* ==================================================================
 * Quick-start templates — one click to a useful pivot
 * ================================================================== */

export interface ReportTemplate {
  id: string;
  label: string;
  blurb: string;
  dataset: ReportDatasetId;
  config: PivotConfig;
  /** Filters the template needs; applied on top of a cleared filter state. */
  filters?: (rf: ReportFilterState, ctx: { fyStart: string; latest: string }) => ReportFilterState;
}

export const TEMPLATES: ReportTemplate[] = [
  {
    id: 'signings-bd-month',
    label: 'Signings by BD by month',
    blurb: 'MA-signed deals · BD × month',
    dataset: 'deals',
    config: {
      rows: ['owner'],
      cols: ['contractedMonth'],
      values: [{ id: 't1', field: '__records', agg: 'count', label: 'Signings' }],
    },
    filters: (rf) => ({ ...rf, stage: new Set(['MA Signed']) }),
  },
  {
    id: 'ta-brand-region',
    label: 'TA contracted by brand by region',
    blurb: 'Deals · region × brand, Sum of TA fee',
    dataset: 'deals',
    config: {
      rows: ['region'],
      cols: ['brand'],
      values: [{ id: 't1', field: 'feeContracted', agg: 'sum', label: '' }],
    },
    filters: (rf) => ({ ...rf, stage: new Set(['MA Signed', 'LOI Signed']) }),
  },
  {
    id: 'leads-source-region',
    label: 'Leads by source by region',
    blurb: 'Leads · source × region, Count',
    dataset: 'leads',
    config: {
      rows: ['source'],
      cols: ['region'],
      values: [{ id: 't1', field: '__records', agg: 'count', label: 'Leads' }],
    },
  },
  {
    id: 'lead-status-bd',
    label: 'Lead status by BD',
    blurb: 'Leads · BD × status, Count',
    dataset: 'leads',
    config: {
      rows: ['owner'],
      cols: ['status'],
      values: [{ id: 't1', field: '__records', agg: 'count', label: 'Leads' }],
    },
  },
  {
    id: 'collections-brand-fy',
    label: 'Collections by brand (FY)',
    blurb: 'Deals · brand, Sum of TA collected this FY',
    dataset: 'deals',
    config: {
      rows: ['brand'],
      cols: [],
      values: [
        { id: 't1', field: 'feeCollected', agg: 'sum', label: '' },
        { id: 't2', field: '__records', agg: 'count', label: 'Deals' },
      ],
    },
    filters: (rf, ctx) => ({ ...rf, from: ctx.fyStart, to: ctx.latest, presetLabel: '' }),
  },
  {
    id: 'pipeline-stage-region',
    label: 'Pipeline by stage by region',
    blurb: 'Deals · stage × region, Count + keys',
    dataset: 'deals',
    config: {
      rows: ['stage'],
      cols: ['region'],
      values: [{ id: 't1', field: '__records', agg: 'count', label: 'Deals' }],
    },
  },
];
