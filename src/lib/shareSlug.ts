/**
 * The short, memorable, admin-editable name that sits in the public share URL
 * in place of the 43-character random token:
 *
 *     /share/olive-bd          <- the slug (what people are actually sent)
 *     /share/<43-char token>   <- still works, forever, so links already sent
 *                                 never break
 *
 * The slug is GUESSABLE and that is a deliberate, informed product decision:
 * a URL you can read down the phone is worth more here than 256 bits of
 * entropy. Everything that made the random token safe is untouched — the
 * cookie swap, the /admin hard block, the per-request Postgres revocation
 * check — and two extra guards specifically compensate for guessability
 * without ever getting in a real visitor's way:
 *
 *   1. X-Robots-Tag: noindex, nofollow on /share/* plus a /robots.txt
 *      disallow, so a guessable URL cannot end up in a search index.
 *   2. A per-IP throttle on FAILED share lookups (see share_guess_failed() in
 *      Postgres — not module memory, because every lambda has its own heap).
 *      Someone typing the right slug is never counted, never slowed.
 *
 * This module is pure and dependency-free so the SAME validation runs in the
 * admin UI (live, as you type) and in the API route (authoritative). The
 * database CHECK constraint share_links_slug_format + share_slug_reserved()
 * is the third, un-bypassable copy: even a direct PostgREST write is refused.
 */

/** Lowercase letters, digits and hyphens. 4–32 chars. No leading/trailing hyphen. */
export const SHARE_SLUG_RE = /^[a-z0-9][a-z0-9-]{2,30}[a-z0-9]$/;

export const SHARE_SLUG_MIN = 4;
export const SHARE_SLUG_MAX = 32;

/**
 * Names that would collide with, shadow or impersonate a real app route, or
 * that read like a system path. MUST stay identical to the list inside the
 * Postgres function public.share_slug_reserved().
 */
export const RESERVED_SHARE_SLUGS: readonly string[] = [
  'admin',
  'api',
  'login',
  'logout',
  'auth',
  'share',
  'reset-password',
  'static',
  '_next',
  'favicon',
  'robots',
  'sitemap',
  'dashboard',
  'settings',
  'null',
  'undefined',
  'assets',
  'public',
  'well-known',
  'signin',
  'signup',
  'account',
  'root',
  'system',
  'index',
  'home',
  'support',
  'help',
  'security',
];

export function isReservedShareSlug(value: string): boolean {
  return RESERVED_SHARE_SLUGS.includes(value.trim().toLowerCase());
}

/** What we store and compare against: trimmed and lowercased. */
export function normalizeShareSlug(value: string): string {
  return value.trim().toLowerCase();
}

export type SlugCheck = { ok: true; slug: string } | { ok: false; error: string };

/**
 * The single source of truth for "is this a usable slug?", minus uniqueness
 * (which only the database can answer). Messages are written to be shown
 * verbatim to the admin.
 */
export function validateShareSlug(raw: string): SlugCheck {
  const slug = normalizeShareSlug(raw ?? '');

  if (!slug) {
    return { ok: false, error: 'Enter a short name for the link.' };
  }
  if (slug.length < SHARE_SLUG_MIN) {
    return { ok: false, error: `Too short — use at least ${SHARE_SLUG_MIN} characters.` };
  }
  if (slug.length > SHARE_SLUG_MAX) {
    return { ok: false, error: `Too long — use at most ${SHARE_SLUG_MAX} characters.` };
  }
  if (isReservedShareSlug(slug)) {
    return { ok: false, error: 'That name is reserved — please pick another.' };
  }
  if (!SHARE_SLUG_RE.test(slug)) {
    if (/^-|-$/.test(slug)) {
      return { ok: false, error: 'It cannot start or end with a hyphen.' };
    }
    return { ok: false, error: 'Use only lowercase letters, numbers and hyphens — no spaces or symbols.' };
  }
  return { ok: true, slug };
}
