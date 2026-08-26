import { NextRequest, NextResponse } from 'next/server';
import { getSessionProfile, scopeFromProfile, hasSetPassword, type Scope } from '@/lib/auth';
import { applyRegionScope } from '@/lib/regionScope';
import { logAuditEvent, clientIp, userAgent } from '@/lib/audit';
import { SHARE_COOKIE, logShareEvent, resolveShareToken } from '@/lib/share';

/*
 * Server-side data route. LIVE FEED ONLY. AUTH REQUIRED.
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
 *
 * Region scoping: this route requires a valid session (the proxy already
 * redirects unauthenticated page loads to /login, but this is a second,
 * independent check — never rely on the proxy alone). A region-scoped
 * caller's browser must never even receive another region's rows over the
 * network, so the RAW merged feed is cached module-scope (never a filtered
 * result — that would risk one user's scope leaking into another's cached
 * response), and applyRegionScope() runs fresh on every request, after the
 * cache read, keyed to the calling session's own profile.
 *
 * Password-set gate: a valid session alone does not mean the user ever
 * actually saved a real password (see src/lib/auth.ts / src/proxy.ts). The
 * proxy already blocks this in normal operation — this is the same
 * independent second check as the region scoping above, not the only one.
 *
 * Share link: a visitor holding a valid, unrevoked share cookie is the ONE
 * unauthenticated caller this route serves, deliberately (see src/lib/share.ts).
 * They get scope {full:true} — exactly what a `leadership` user sees — and the
 * feed access is audited as email='shared-link' with detail.via='share'. Every
 * other unauthenticated request is still a flat 401.
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
  // Pre-wired for a private data repo: set GITHUB_FEED_TOKEN (fine-grained,
  // read-only, data repo only) in Vercel and the raw fetches authenticate.
  // Absent the env var, behaviour is unchanged (public raw URLs).
  const token = process.env.GITHUB_FEED_TOKEN;
  const res = await fetch(url, {
    cache: 'no-store',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
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

export async function GET(req: NextRequest) {
  const session = await getSessionProfile();

  let scope: Scope;
  if (session) {
    if (!hasSetPassword(session.profile)) {
      return NextResponse.json(
        { error: 'You need to set a password before continuing. Please finish the reset-password step.' },
        { status: 401 }
      );
    }
    scope = scopeFromProfile(session.profile);

    // Audit: who pulled the feed, and how it was scoped for them.
    await logAuditEvent(session.supabase, {
      userId: session.userId,
      email: session.email,
      event: 'feed_access',
      detail: { route: '/api/dashboard', scope: scope.full ? 'full' : scope.regions },
      ip: clientIp(req),
      userAgent: userAgent(req),
    });
  } else {
    // The only unauthenticated door: a live public share link.
    const share = await resolveShareToken(req.cookies.get(SHARE_COOKIE)?.value);
    if (!share) {
      return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
    }
    scope = { full: true };
    await logShareEvent(
      share.token,
      'feed_access',
      { route: '/api/dashboard', scope: 'full' },
      clientIp(req),
      userAgent(req)
    );
  }

  const url = process.env.DASHBOARD_DATA_URL || DEFAULT_DATA_URL;
  const dealsUrl = process.env.DEALS_DATA_URL || DEFAULT_DEALS_URL;
  const proposalsUrl = process.env.PROPOSALS_DATA_URL || DEFAULT_PROPOSALS_URL;
  const orgUrl = process.env.ORG_DATA_URL || DEFAULT_ORG_URL;

  // Serve the cached copy while it is still fresh — always the RAW,
  // unfiltered merge. Scoping is applied per-request below, never cached.
  if (urlCache && Date.now() - urlCache.at < URL_TTL_MS) {
    return NextResponse.json(applyRegionScope(urlCache.data, scope));
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
    return NextResponse.json(applyRegionScope(merged, scope));
  } catch {
    // Feed hiccup — serve the last good LIVE copy if we have one; otherwise an
    // honest error. We never fall back to bundled/placeholder data.
    if (urlCache) return NextResponse.json(applyRegionScope(urlCache.data, scope));
    return NextResponse.json(
      { error: 'The live data feed is temporarily unavailable. Please try again shortly.' },
      { status: 503 }
    );
  }
}
