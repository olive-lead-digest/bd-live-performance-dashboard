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

export async function GET() {
  const url = process.env.DASHBOARD_DATA_URL;

  if (!url) {
    return NextResponse.json(
      { error: 'Live data feed is not configured. Set DASHBOARD_DATA_URL to the published Zoho/Zoom/Sheets feed.' },
      { status: 503 }
    );
  }

  // Serve the cached copy while it is still fresh.
  if (urlCache && Date.now() - urlCache.at < URL_TTL_MS) {
    return NextResponse.json(urlCache.data);
  }

  try {
    const data = await fromUrl(url);
    urlCache = { at: Date.now(), data };
    return NextResponse.json(data);
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
