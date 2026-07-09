'use client';

import type { Filters } from './DashboardContext';

// P2-3(1) — ONE shared CSV implementation for the whole app. Every per-table
// "CSV" button (see components/CsvButton.tsx) and DrillDrawer reuse this, so
// there is a single escape/quote/BOM implementation and a consistent,
// filter-aware filename scheme (e.g. deals_spark_2026-07-09.csv).

export interface CsvColumn<T = any> {
  key: string;
  label: string;
  format?: (row: T) => string | number | null | undefined;
}

const escapeCell = (s: string): string =>
  /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;

function cellValue(col: CsvColumn, row: any): string {
  const v = col.format ? col.format(row) : row?.[col.key];
  return v == null ? '' : String(v);
}

/** Build a CSV string from columns + rows (header row followed by data rows). */
export function toCsv(columns: CsvColumn[], rows: any[]): string {
  const head = columns.map((c) => escapeCell(c.label)).join(',');
  const body = (rows || [])
    .map((r) => columns.map((c) => escapeCell(cellValue(c, r))).join(','))
    .join('\n');
  return body ? head + '\n' + body : head;
}

/** Trigger a client-side download of the given rows as a .csv file. */
export function downloadCsv(filename: string, columns: CsvColumn[], rows: any[]): void {
  const csv = toCsv(columns, rows);
  // Prepend a UTF-8 BOM so Excel renders the rupee sign and other non-ASCII.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.toLowerCase().endsWith('.csv') ? filename : filename + '.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const FILTER_KEYS = ['brand', 'region', 'state', 'city', 'cluster', 'tier', 'status', 'prop', 'owner'] as const;

/** Compact slug describing the active global filters, used inside filenames. */
export function filterSlug(filters?: Filters | null): string {
  if (!filters) return 'all';
  const parts: string[] = [];
  for (const k of FILTER_KEYS) {
    const s = filters[k] as Set<string> | undefined;
    if (s && s.size) parts.push(Array.from(s).join('-'));
  }
  if (filters.from || filters.to) parts.push(`${filters.from || 'start'}to${filters.to || 'now'}`);
  const slug = parts.join('_').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'all';
}

/** e.g. csvFilename('deals', filters) -> "deals_spark_2026-07-09.csv". */
export function csvFilename(base: string, filters?: Filters | null): string {
  const date = new Date().toISOString().slice(0, 10);
  return `${base}_${filterSlug(filters)}_${date}.csv`;
}
