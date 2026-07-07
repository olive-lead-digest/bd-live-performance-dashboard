import { NextResponse } from 'next/server';

/*
 * Server-side data route. LIVE FEED ONLY.
 *
 * The dashboard shows exclusively the real data pushed by the refresh job
 * (Zoho CRM + Zoom Phone + the Partner-With-Us Google Sheet), published as a
 * plain JSON feed at DASHBOARD_DATA_URL and fetched here at runtime (cached
 * ~10 min so the public link is always fresh without rebuilding the site).
 *
 * There is deliberately NO bundled / placeholder / mock fallback: if the live
 * feed is ever unreachable and we have no recent copy in memory, this returns
 * an explicit error rather than showing stale or sample data. No Zoho/Google/
 * Zoom credentials live in the web app — the refresh job owns all fetching.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const URL_TTL_MS = 10 * 60 * 1000; // 10 minutes — keeps the feed fresh without hammering it

let urlCache: { at: number; data: unknown } | null = null;

function parseMaybeJsWrapper(raw: string): unknown {
  const trimmed = raw.trimStart();
  if (trimmed.startsWith('{')) return JSON.parse(raw);
  // window.DASH_DATA={...}; form
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('Unrecognized dashboard data format');
  return JSON.parse(raw.slice(start, end + 1));
}

async function fromUrl(url: string): Promise<unknown> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`data feed responded ${res.status}`);
  return parseMaybeJsWrapper(await res.text());
}

// Public raw-GitHub feeds the hourly pipeline publishes to. Overridable via env.
const DEFAULT_DATA_URL =
  'https://raw.githubusercontent.com/olive-lead-digest/bd-live-performance-dashboard/data/dashboard_data.json';
const DEFAULT_DEALS_URL =
  'https://raw.githubusercontent.com/olive-lead-digest/bd-live-performance-dashboard/data/deals.json';
const DEFAULT_PROPOSALS_URL =
  'https://raw.githubusercontent.com/olive-lead-digest/bd-live-performance-dashboard/data/proposals.json';
const DEFAULT_ORG_URL =
  'https://raw.githubusercontent.com/olive-lead-digest/bd-live-performance-dashboard/data/bd_org.json';

export async function GET() {
  const url = process.env.DASHBOARD_DATA_URL || DEFAULT_DATA_URL;
  const dealsUrl = process.env.DEALS_DATA_URL || DEFAULT_DEALS_URL;
  const proposalsUrl = process.env.PROPOSALS_DATA_URL || DEFAULT_PROPOSALS_URL;
  const orgUrl = process.env.ORG_DATA_URL || DEFAULT_ORG_URL;

  // Serve the cached copy while it is still fresh.
  if (urlCache && Date.now() - urlCache.at < URL_TTL_MS) {
    return NextResponse.json(urlCache.data);
  }

  try {
    // Leads feed is required; the Deals and Proposals feeds are best-effort
    // (a hiccup there must not break the page).
    const [data, deals, proposals, org] = await Promise.all([
      fromUrl(url),
      fromUrl(dealsUrl).catch(() => null),
      fromUrl(proposalsUrl).catch(() => null),
      fromUrl(orgUrl).catch(() => null),
    ]);
    const merged =
      data && typeof data === 'object'
        ? { ...(data as Record<string, unknown>), deals, proposals, org }
        : data;
    urlCache = { at: Date.now(), data: merged };
    return NextResponse.json(merged);
  } catch {
    // Feed hiccup — serve the last good LIVE copy if we have one; otherwise an
    // honest error. We never fall back to bundled/placeholder data.
    if (urlCache) return NextResponse.json(urlCache.data);
    return NextResponse.json(
      { error: 'The live data feed is temporarily unavailable. Please try again shortly.' },
      { status: 503 }
    );
  }
}
