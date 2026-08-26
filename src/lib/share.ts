/**
 * Public "anyone with the link" share access.
 *
 * ONE live share link, stored server-side in public.share_links, grants the
 * same data scope a `leadership` user gets (all regions, all brands) with no
 * login and no password. Deliberate product decision.
 *
 * It is reachable by TWO values, either of which may appear at /share/<value>
 * and either of which may end up in the httpOnly cookie:
 *   - `token` — the original 43-char random string. Never retired, so every
 *     link that has already been sent out keeps working.
 *   - `slug`  — a short, memorable, admin-editable name (e.g. `olive-bd`),
 *     matched case-insensitively. Short enough to read down the phone, and
 *     therefore GUESSABLE by design; see src/lib/shareSlug.ts for the two
 *     guards that offset that without ever throttling a real visitor.
 * A slug visitor's cookie holds the slug, so the long random token is never
 * disclosed to them.
 *
 * The engineering guards around all of it:
 *
 *   - The value lives in the URL path only long enough to be exchanged for an
 *     httpOnly cookie at /share/<value>; it is never readable from browser JS,
 *     and the random token is never hardcoded in this repo.
 *   - Failed lookups are throttled per IP in Postgres (share_guess_failed),
 *     so the shorter, guessable slug cannot be brute-forced; a correct value
 *     never touches the counter.
 *   - Validity is re-checked against Postgres on EVERY request (no caching
 *     anywhere), so revoking a link kills it on the very next request.
 *   - The share cookie is NOT a Supabase session. It carries no JWT, no user
 *     id, and cannot be exchanged for one — a share visitor has no user
 *     identity, so every `auth.uid()`-gated RLS policy simply returns nothing
 *     for them. They cannot read user_profiles, audit_log or share_links.
 *   - /admin/* and /api/admin/* are hard-blocked for share traffic in
 *     src/proxy.ts, on top of each admin page's own server-side role check.
 *   - Audit writes go through log_share_event(), a token-gated SECURITY
 *     DEFINER function that can only ever emit user_id = NULL /
 *     email = 'shared-link' / detail.via = 'share' rows — the same narrow
 *     pattern as the existing log_login_failed(). The general audit_log RLS
 *     policies are untouched.
 *
 * This module is deliberately dependency-free (plain fetch against PostgREST,
 * no next/headers, no @supabase/ssr) so the SAME code runs in the Edge proxy
 * and in Node route handlers. Cookie reading for Server Components lives in
 * src/lib/shareSession.ts instead.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://bihqperphtxromsglyww.supabase.co';
const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_LBIcygJp_4ah7e0x4LMVNw_Vhpdnl0i';

/** Public origin the share URL is built against. */
export const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_ORIGIN || 'https://bd-live-performance-dashboard.vercel.app';

/** The full shareable URL for a token or slug. */
export function shareUrl(tokenOrSlug: string): string {
  return `${APP_ORIGIN}/share/${tokenOrSlug}`;
}

/** httpOnly cookie that carries the share token after /share/<token>. */
export const SHARE_COOKIE = 'bd_share';

/** Share sessions expire on their own after this long; revocation is instant
 *  and independent of it (validity is re-read from Postgres every request). */
export const SHARE_COOKIE_MAX_AGE = 12 * 60 * 60; // 12 hours

/** Random tokens are 43-char base64url (32 random bytes). */
const TOKEN_RE = /^[A-Za-z0-9_-]{40,200}$/;

/** Slugs are 4-32 chars of letters/digits/hyphens, no leading or trailing
 *  hyphen. Accepted in any case here because the database matches slugs
 *  case-insensitively; see src/lib/shareSlug.ts for the canonical rules. */
const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9-]{2,30}[A-Za-z0-9]$/;

/** `token` here is whatever value the visitor holds — the random token OR the
 *  slug. Every share RPC accepts either, so it is used verbatim as the key. */
export type ShareContext = { token: string; label: string };

export type ShareAuditEvent =
  | 'share_visit'
  | 'page_view'
  | 'ask_question'
  | 'report_export'
  | 'feed_access';

async function rpc<T>(fn: string, body: Record<string, unknown>): Promise<T | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** Cheap shape check: could this string possibly be a live share value?
 *  Anything that fails here is rejected before a database round trip. */
export function looksLikeShareToken(token: string | undefined | null): token is string {
  return !!token && (TOKEN_RE.test(token) || SLUG_RE.test(token));
}

/**
 * Is this token-or-slug live right now? Fails CLOSED on anything unexpected
 * (bad shape, revoked, unknown, database unreachable) — never assume access.
 */
export async function resolveShareToken(token: string | undefined | null): Promise<ShareContext | null> {
  if (!looksLikeShareToken(token)) return null;
  const rows = await rpc<{ active: boolean; label: string }[]>('share_link_status', { p_token: token });
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row?.active) return null;
  return { token, label: row.label || 'Shared dashboard link' };
}

/** Landing-page hit: bumps hits/last_seen_at. Returns whether the link was live. */
export async function touchShareToken(token: string): Promise<boolean> {
  const ok = await rpc<boolean>('share_link_touch', { p_token: token });
  return ok === true;
}

/**
 * Append one share-attributed audit row. Best-effort: a logging failure must
 * never break the shared view, exactly like logAuditEvent() for real users.
 */
export async function logShareEvent(
  token: string,
  event: ShareAuditEvent,
  detail: Record<string, unknown>,
  ip: string,
  ua: string
): Promise<void> {
  await rpc<null>('log_share_event', {
    p_token: token,
    p_event: event,
    p_detail: detail ?? {},
    p_ip: ip,
    p_user_agent: ua,
  });
}

/* ------------------------------------------------------------------------ *
 * Failed-guess guard.
 *
 * The slug is short and guessable on purpose, so the one thing we must not
 * allow is an unlimited stream of wrong guesses. The counter lives in
 * Postgres, NOT in a module-level Map: on Vercel every lambda instance has
 * its own heap, so an in-memory limiter would reset itself constantly and
 * count nothing.
 *
 * Crucially this only ever moves when a lookup FAILS. A visitor who opens the
 * correct /share/olive-bd link a thousand times is never counted and never
 * throttled — the limit is invisible to everyone except someone guessing.
 * Both calls are best-effort: if the database is unreachable the guard opens
 * rather than locking real visitors out (resolveShareToken still fails closed,
 * so this cannot grant access on its own).
 * ------------------------------------------------------------------------ */

/** Is this IP currently in its cooldown after too many wrong guesses? */
export async function shareGuessBlocked(ip: string): Promise<boolean> {
  const blocked = await rpc<boolean>('share_guess_blocked', { p_ip: ip });
  return blocked === true;
}

/**
 * Record one FAILED share lookup. Returns true once the IP has crossed the
 * threshold (~20 wrong values in 10 minutes -> 10 minute cooldown). Crossing
 * it writes a `share_rate_limited` row to audit_log in the same narrow shape
 * log_share_event() uses (user_id NULL, email 'shared-link', detail.via
 * 'share').
 */
export async function shareGuessFailed(ip: string, ua: string): Promise<boolean> {
  const blocked = await rpc<boolean>('share_guess_failed', { p_ip: ip, p_user_agent: ua });
  return blocked === true;
}
