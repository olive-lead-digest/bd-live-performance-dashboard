import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logAuditEvent, clientIp, userAgent } from '@/lib/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Sets a new password for the CURRENT session — used by /reset-password after
 * a one-time setup / recovery link (the /auth/confirm route turns the link
 * into a session first). Also works for a normally signed-in user.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) {
    return NextResponse.json(
      { error: 'Your link is invalid or has expired. Use “Forgot password” on the sign-in page, or ask Harshit Sharma for a fresh setup link.' },
      { status: 401 }
    );
  }
  const userId = claims.claims.sub as string;
  const email = claims.claims.email as string | undefined;

  let body: { password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const password = typeof body.password === 'string' ? body.password : '';
  if (password.length < 12) {
    return NextResponse.json({ error: 'Choose a password with at least 12 characters.' }, { status: 400 });
  }

  const { error: updateErr } = await supabase.auth.updateUser({ password });
  if (updateErr) {
    const msg = /same password|same_password/i.test(updateErr.message || '')
      ? 'That is already your current password — choose a different one.'
      : updateErr.message || 'Could not update password.';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  await logAuditEvent(supabase, {
    userId,
    email,
    event: 'password_set',
    detail: {},
    ip: clientIp(req),
    userAgent: userAgent(req),
  });
  return NextResponse.json({ ok: true });
}
