// Shared display formatters for the BD dashboard.
// Matches the local inr()/num() helpers already used across the deal components.

export const inr = (n?: number | null): string =>
  n == null
    ? '—'
    : new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        notation: 'compact',
        maximumFractionDigits: 2,
      }).format(n);

export const num = (n?: number | null): string =>
  n == null ? '—' : Math.round(n).toLocaleString('en-IN');

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
