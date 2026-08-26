/**
 * Public "anyone with the link" share access.
 *
 * ONE long random token, stored server-side in public.share_links, grants the
 * same data scope a `leadership` user gets (all regions, all brands) with no
 * login and no password. Deliberate product decision; the engineering guards
 * around it are:
 *
 *   - The token lives in the URL path only long enough to be exchanged for an
 *     httpOnly cookie at /share/<token>; it is never readable from browser JS
 *     and never hardcoded in this repo.
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

/** The full shareable URL for a token. */
export function shareUrl(token: string): string {
  return `${APP_ORIGIN}/share/${token}`;
}

/** httpOnly cookie that carries the share token after /share/<token>. */
export const SHARE_COOKIE = 'bd_share';

/** Share sessions expire on their own after this long; revocation is instant
 *  and independent of it (validity is re-read from Postgres every request). */
export const SHARE_COOKIE_MAX_AGE = 12 * 60 * 60; // 12 hours

/** Tokens are 43-char base64url (32 random bytes). Anything shorter or with
 *  unexpected characters is rejected before a database round trip. */
const TOKEN_RE = /^[A-Za-z0-9_-]{40,200}$/;

export type ShareContext = { token: string; label: string };

export type ShareAuditEvent =
  | 'share_visit'
  | 'page_view'
  | 'ask_question'
  | 'report_export'
  | 'feed_access'
  | 'share_rate_limited';

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

export function looksLikeShareToken(token: string | undefined | null): token is string {
  return !!token && TOKEN_RE.test(token);
}

/**
 * Is this token live right now? Fails CLOSED on anything unexpected (bad
 * shape, revoked, unknown, database unreachable) — never assume access.
 */
export async function resolveShareToken(token: string | undefined | null): Promise<ShareContext | null> {
  if (!looksLikeShareToken(token)) return null;
  const rows = await rpc<{ active: boolean; label: string }[]>('share_link_status', { p_token: token });
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row?.active) return null;
  return { token, label: row.label || 'Shared dashboard link' };
}

/** Landing-page hit: bumps hits/last_seen_at. Returns whether the token was live. */
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

export type ShareAskVerdict = 'ok' | 'ip' | 'global' | 'invalid';

/**
 * Ask AI spend guard. Fails CLOSED: if the counter table can't be reached we
 * report the global cap rather than letting unmetered questions through to a
 * paid model.
 */
export async function shareAskAllowed(
  token: string,
  ip: string,
  perIpHour: number,
  globalDay: number
): Promise<ShareAskVerdict> {
  const verdict = await rpc<string>('share_ask_allow', {
    p_token: token,
    p_ip: ip,
    p_per_ip_hour: perIpHour,
    p_global_day: globalDay,
  });
  if (verdict === 'ok' || verdict === 'ip' || verdict === 'global' || verdict === 'invalid') {
    return verdict;
  }
  return 'global';
}
