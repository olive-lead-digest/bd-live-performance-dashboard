import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { getSessionProfile } from '@/lib/auth';
import { shareUrl } from '@/lib/share';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Admin-only management of the public share link.
 *
 *   POST { action: 'create' }  -> revokes any live link, mints a fresh one
 *   POST { action: 'revoke' }  -> revokes every live link, immediately
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
 */

export async function POST(req: NextRequest) {
  const session = await getSessionProfile();
  if (!session) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  if (session.profile.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  }

  let body: { action?: unknown; label?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const action = typeof body.action === 'string' ? body.action : '';

  // Revoke first in BOTH branches: there is only ever one live share link, so
  // generating a fresh one implicitly kills the old one (and anyone still
  // holding it loses access on their very next request).
  if (action === 'revoke' || action === 'create') {
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

  const { data, error } = await session.supabase
    .from('share_links')
    .insert({ token, label, created_by: session.userId })
    .select('id, token, label, created_at, hits, last_seen_at')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message || 'Could not create a share link.' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    link: { ...data, url: shareUrl(data.token) },
  });
}
