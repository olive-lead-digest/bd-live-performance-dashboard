'use client';

// Shared duration presets. Extracted verbatim from FilterDrawer so the global
// filter drawer and the /reports page offer the EXACT same preset set (and the
// same "relative to the latest date present in the data" semantics) — a preset
// must never mean two different ranges in two different places.

export interface DatePreset {
  label: string;
  from: string;
  to: string;
}

const parseDate = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const fmtDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Latest `dt` present in the lead dataset ('' when unknown/empty). */
export function latestLeadDate(leads?: { dt?: string }[] | null): string {
  if (!Array.isArray(leads) || !leads.length) return '';
  const max = leads.reduce((m, l) => (l.dt && l.dt > m ? l.dt : m), '0000-00-00');
  return max === '0000-00-00' ? '' : max;
}

/** Quick duration presets, computed relative to the latest date in the data. */
export function buildDatePresets(maxDt: string): DatePreset[] {
  const arr: DatePreset[] = [{ label: 'All time', from: '', to: '' }];
  if (!maxDt) return arr;
  const end = parseDate(maxDt);
  const startOfMonth = new Date(end.getFullYear(), end.getMonth(), 1);
  const lmStart = new Date(end.getFullYear(), end.getMonth() - 1, 1);
  const lmEnd = new Date(end.getFullYear(), end.getMonth(), 0);
  const d30 = new Date(end);
  d30.setDate(end.getDate() - 29);
  const d90 = new Date(end);
  d90.setDate(end.getDate() - 89);
  const q = Math.floor(end.getMonth() / 3);
  const qStart = new Date(end.getFullYear(), q * 3, 1);
  const yStart = new Date(end.getFullYear(), 0, 1);
  arr.push(
    { label: 'Last 30 days', from: fmtDate(d30), to: fmtDate(end) },
    { label: 'Last 90 days', from: fmtDate(d90), to: fmtDate(end) },
    { label: 'This month', from: fmtDate(startOfMonth), to: fmtDate(end) },
    { label: 'Last month', from: fmtDate(lmStart), to: fmtDate(lmEnd) },
    { label: 'This quarter', from: fmtDate(qStart), to: fmtDate(end) },
    { label: 'This year', from: fmtDate(yStart), to: fmtDate(end) }
  );
  return arr;
}

/**
 * Which preset chip should be lit.
 *
 * Identity first: the label the user explicitly CHOSE wins. Only when there is
 * no explicit choice (filters hydrated from a pasted URL, which deliberately
 * does not serialise presetLabel) do we fall back to range-matching — and then
 * to the FIRST match only, so two presets sharing a range (on 21 Jul 2026
 * "This month" and "This quarter" are both 1 Jul -> today) can never both
 * light up. Do NOT "simplify" this back to range equality.
 */
export function activePreset(presets: DatePreset[], presetLabel: string, from: string, to: string): string {
  if (presetLabel) return presetLabel;
  const hit = presets.find((p) => p.from === from && p.to === to);
  return hit ? hit.label : '';
}
