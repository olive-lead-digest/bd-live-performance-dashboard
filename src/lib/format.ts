// ---------------------------------------------------------------------------
// THE shared display-format module for the whole dashboard (P1-2).
//
// Rules enforced here, ONCE, for every module that renders a number:
//   • Counts  → full Indian thousands separators (16,383) via `num`, or an
//               Indian compact suffix K / L / Cr via `compactNum`. NEVER a
//               "T" / "M" / "B" suffix.
//   • Currency→ Indian-only compact: ₹40K / ₹1.4L / ₹4.72Cr via `inr`.
//
// Why hand-rolled instead of Intl `notation:'compact'`?
//   Intl.NumberFormat('en-IN', { notation:'compact' }) abbreviates "thousand"
//   as "T" under several ICU builds (notably Node's server runtime), so a value
//   like 16,383 renders "16.38T" — read by a viewer as *trillion*, and fees
//   render "₹40T". A hand-rolled Indian scale (K < L < Cr) is deterministic
//   across the browser and the server runtime and can never emit T/M/B.
// ---------------------------------------------------------------------------

// Trim trailing zeros: "40.00" -> "40", "1.40" -> "1.4", "4.72" -> "4.72".
const trimZeros = (s: string): string =>
  s.indexOf('.') === -1 ? s : s.replace(/\.?0+$/, '');

// Split |n| onto the Indian scale, returning the mantissa string + suffix.
// abs<1000 → plain grouped; <1e5 → K (thousand); <1e7 → L (lakh); else Cr.
const indianCompact = (n: number): string => {
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (a < 1000) return sign + Math.round(a).toLocaleString('en-IN');
  if (a < 1e5) return `${sign}${trimZeros((a / 1e3).toFixed(2))}K`;
  if (a < 1e7) return `${sign}${trimZeros((a / 1e5).toFixed(2))}L`;
  return `${sign}${trimZeros((a / 1e7).toFixed(2))}Cr`;
};

/** Full integer with Indian thousands separators, e.g. 16383 → "16,383". */
export const num = (n?: number | null): string =>
  n == null || !Number.isFinite(n) ? '—' : Math.round(n).toLocaleString('en-IN');

/** Compact COUNT on the Indian scale (K / L / Cr) — never T / M / B. */
export const compactNum = (n?: number | null): string =>
  n == null || !Number.isFinite(n) ? '—' : indianCompact(n);

/** Compact INR currency: ₹40K / ₹1.4L / ₹4.72Cr — never T / M / B. */
export const inr = (n?: number | null): string =>
  n == null || !Number.isFinite(n) ? '—' : `₹${indianCompact(n)}`;

export const pct = (n?: number | null): string =>
  n == null ? '—' : `${n.toFixed(0)}%`;

// Brand -> brand colour used across deal cards.
export const BRAND_COLORS: Record<string, string> = {
  Olive: '#502875',
  Spark: '#da1a84',
  'Open Hotels': '#a470d6',
};

export const brandColor = (b?: string) => BRAND_COLORS[b || ''] || '#4a4957';

// Short human date, e.g. "8 Jul 2026".
export const shortDate = (iso?: string): string => {
  if (!iso) return '—';
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};
