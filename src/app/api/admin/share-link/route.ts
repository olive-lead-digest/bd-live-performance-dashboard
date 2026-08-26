import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { getSessionProfile } from '@/lib/auth';
import { shareUrl } from '@/lib/share';
import { normalizeShareSlug, validateShareSlug } from '@/lib/shareSlug';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Admin-only management of the public share link.
 *
 *   POST { action: 'create' }              -> revokes any live link, mints a fresh one
 *   POST { action: 'revoke' }              -> revokes every live link, immediately
 *   POST { action: 'set-slug', slug }      -> renames the live link's short URL
 *   POST { action: 'check-slug', slug }    -> live availability check for the admin UI
 *
 * Writes run under the ADMIN'S OWN session against share_links, whose RLS
 * policies are is_admin()-gated for select/insert/update (and have no delete
 * policy at all — links are revoked, never erased). So this route is a
 * convenience wrapper: even if it were called by a non-admin, RLS would
 * refuse the write. No service-role key exists in this app, by design.
 *
 * The token is 32 cryptographically random bytes rendered base64url — 43
 * characters, 256 bits of entropy. It is generated here and never hardcoded
 * anywhere in the repository.
 *
 * The SLUG is the opposite: short, memorable and guessable on purpose, so the
 * link can be read down the phone. Its rules live in one pure module
 * (src/lib/shareSlug.ts) used by both this route and the admin UI, and are
 * duplicated as a CHECK constraint + share_slug_reserved() in Postgres so no
 * write path — this route, a direct PostgREST call, or psql — can bypass them.
 */

/** Everything the admin panel needs to render one live link. */
const LINK_COLUMNS = 'id, token, slug, label, created_at, hits, last_seen_at';

type LinkRow = {
  id: string;
  token: string;
  slug: string | null;
  label: string;
  created_at: string;
  hits: number;
  last_seen_at: string | null;
};

function shape(row: LinkRow) {
  return {
    id: row.id,
    slug: row.slug,
    // What the admin copies and sends: the slug URL whenever there is one.
    url: shareUrl(row.slug || row.token),
    // The original random URL, still live, for anyone already holding it.
    tokenUrl: shareUrl(row.token),
    label: row.label,
    created_at: row.created_at,
    hits: row.hits,
    last_seen_at: row.last_seen_at,
  };
}

/** Postgres unique-violation / check-violation surfaced as plain English. */
function slugDbError(message: string, code?: string): string {
  if (code === '23505' || /duplicate key|share_links_slug_lower_key/i.test(message)) {
    return 'That name is already taken — please pick another.';
  }
  if (code === '23514' || /share_links_slug_format/i.test(message)) {
    return 'That name cannot be used — use 4–32 lowercase letters, numbers or hyphens.';
  }
  return message;
}

export async function POST(req: NextRequest) {
  const session = await getSessionProfile();
  if (!session) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  if (session.profile.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  }

  let body: { action?: unknown; label?: unknown; slug?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const action = typeof body.action === 'string' ? body.action : '';

  // ---------------------------------------------------------------------
  // Live "is this name free?" check for the admin UI. Read-only.
  // ---------------------------------------------------------------------
  if (action === 'check-slug') {
    const check = validateShareSlug(typeof body.slug === 'string' ? body.slug : '');
    if (!check.ok) return NextResponse.json({ ok: false, available: false, error: check.error });

    const { data, error } = await session.supabase
      .from('share_links')
      .select('id')
      .is('revoked_at', null)
      .ilike('slug', check.slug);
    if (error) {
      return NextResponse.json({ ok: false, available: false, error: error.message }, { status: 500 });
    }
    const taken = (data || []).length > 0;
    return NextResponse.json({
      ok: true,
      available: !taken,
      slug: check.slug,
      error: taken ? 'That name is already taken — please pick another.' : null,
    });
  }

  // ---------------------------------------------------------------------
  // Rename the live link's short URL. The old random token keeps working;
  // only the memorable half changes.
  // ---------------------------------------------------------------------
  if (action === 'set-slug') {
    const check = validateShareSlug(typeof body.slug === 'string' ? body.slug : '');
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

    const { data: live } = await session.supabase
      .from('share_links')
      .select('id')
      .is('revoked_at', null)
      .order('created_at', { ascending: false })
      .limit(1);
    const target = (live || [])[0] as { id: string } | undefined;
    if (!target) {
      return NextResponse.json({ error: 'There is no active share link to rename.' }, { status: 400 });
    }

    const { data, error } = await session.supabase
      .from('share_links')
      .update({ slug: check.slug })
      .eq('id', target.id)
      .select(LINK_COLUMNS)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: slugDbError(error?.message || 'Could not save that name.', error?.code) },
        { status: 400 }
      );
    }
    return NextResponse.json({ ok: true, link: shape(data as LinkRow) });
  }

  // Revoke first in BOTH branches: there is only ever one live share link, so
  // generating a fresh one implicitly kills the old one (and anyone still
  // holding it loses access on their very next request).
  //
  // The slug is carried across a regenerate on purpose: the whole point of
  // /share/olive-bd is that it is the ONE address people have been given, so
  // rotating the secret half must not silently break it. The revoked row keeps
  // its slug for the audit trail — the unique index is scoped to live rows.
  let carriedSlug: string | null = null;

  if (action === 'revoke' || action === 'create') {
    const { data: liveRows } = await session.supabase
      .from('share_links')
      .select('slug')
      .is('revoked_at', null)
      .order('created_at', { ascending: false })
      .limit(1);
    carriedSlug = ((liveRows || [])[0] as { slug: string | null } | undefined)?.slug ?? null;

    const { error: revokeErr } = await session.supabase
      .from('share_links')
      .update({ revoked_at: new Date().toISOString(), revoked_by: session.userId })
      .is('revoked_at', null);
    if (revokeErr) {
      return NextResponse.json({ error: `Could not revoke: ${revokeErr.message}` }, { status: 500 });
    }
  }

  if (action === 'revoke') {
    return NextResponse.json({ ok: true, link: null });
  }

  if (action !== 'create') {
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  }

  const label =
    typeof body.label === 'string' && body.label.trim() ? body.label.trim().slice(0, 120) : 'Shared dashboard link';
  const token = randomBytes(32).toString('base64url'); // 43 chars, 256 bits

  // An explicit slug on the create call wins; otherwise keep the one the old
  // link was using; otherwise none, and the admin can name it afterwards.
  let slug: string | null = null;
  if (typeof body.slug === 'string' && body.slug.trim()) {
    const check = validateShareSlug(body.slug);
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
    slug = check.slug;
  } else if (carriedSlug) {
    slug = normalizeShareSlug(carriedSlug);
  }

  const { data, error } = await session.supabase
    .from('share_links')
    .insert({ token, label, slug, created_by: session.userId })
    .select(LINK_COLUMNS)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: slugDbError(error?.message || 'Could not create a share link.', error?.code) },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, link: shape(data as LinkRow) });
}
