import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

/*
 * Server-side data route. Three sources, in priority order:
 *   1. DASHBOARD_DATA_URL  — a live feed (e.g. raw GitHub data branch) that a
 *      frequent refresh job keeps current. Fetched at runtime and cached ~10 min,
 *      so the public link is always-fresh WITHOUT rebuilding the site. This is the
 *      "always live" path used in production (Netlify).
 *   2. DASHBOARD_DATA_PATH — absolute local file (dev / custom deploys).
 *   3. Bundled/local dashboard_data.json next to the app or the OliveScripts pipeline.
 *
 * No Zoho/Google/Zoom credentials live in the web app — the refresh job owns all
 * external fetching and publishes a plain JSON feed. The data is the same shape
 * regardless of source.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const URL_TTL_MS = 10 * 60 * 1000; // 10 minutes — keeps the feed fresh without hammering it

function candidatePaths(): string[] {
  const fromEnv = process.env.DASHBOARD_DATA_PATH;
  const cwd = process.cwd();
  return [
    fromEnv,
    path.resolve(cwd, 'data', 'dashboard_data.json'),
    path.resolve(cwd, 'public', 'dashboard_data.json'),
    path.resolve(cwd, '..', '..', 'dashboard_data.json'),
    path.resolve(cwd, '..', '..', 'dashboard_data.js'),
  ].filter(Boolean) as string[];
}

let fileCache: { path: string; mtimeMs: number; data: unknown } | null = null;
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
  // 1) Live feed (production)
  const url = process.env.DASHBOARD_DATA_URL;
  if (url) {
    if (urlCache && Date.now() - urlCache.at < URL_TTL_MS) {
      return NextResponse.json(urlCache.data);
    }
    try {
      const data = await fromUrl(url);
      urlCache = { at: Date.now(), data };
      return NextResponse.json(data);
    } catch {
      // Feed hiccup — serve the last good copy if we have one, else fall through to a local file.
      if (urlCache) return NextResponse.json(urlCache.data);
    }
  }

  // 2 & 3) Local file (dev / fallback)
  for (const p of candidatePaths()) {
    try {
      const stat = await fs.stat(p);
      if (fileCache && fileCache.path === p && fileCache.mtimeMs === stat.mtimeMs) {
        return NextResponse.json(fileCache.data);
      }
      const raw = await fs.readFile(p, 'utf8');
      const data = parseMaybeJsWrapper(raw);
      fileCache = { path: p, mtimeMs: stat.mtimeMs, data };
      return NextResponse.json(data);
    } catch {
      // try next candidate
    }
  }

  return NextResponse.json(
    {
      error:
        'No dashboard data available. Set DASHBOARD_DATA_URL to your live feed, or provide a local ' +
        'dashboard_data.json (run the OliveScripts pipeline / refresh_leads_live.py).',
    },
    { status: 503 }
  );
}
