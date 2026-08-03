import { NextRequest, NextResponse } from 'next/server';
import { getSessionProfile } from '@/lib/auth';
import { logAuditEvent, clientIp, userAgent } from '@/lib/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://bihqperphtxromsglyww.supabase.co';

/**
 * Admin-only: issue a fresh one-time setup/recovery link for a dashboard
 * user. The heavy lifting happens in the `provision-users` Edge Function
 * (service role never leaves Supabase); it independently re-verifies that the
 * bearer token belongs to an admin before generating anything, so this route
 * is a convenience wrapper, not the security boundary.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionProfile();
  if (!session) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  if (session.profile.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  }

  let body: { email?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email) return NextResponse.json({ error: 'Missing email.' }, { status: 400 });

  const { data: sessData } = await session.supabase.auth.getSession();
  const accessToken = sessData?.session?.access_token;
  if (!accessToken) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/provision-users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ action: 'recovery_link', email }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.link) {
      return NextResponse.json(
        { error: data?.error || `Could not issue a link (${res.status}).` },
        { status: 502 }
      );
    }

    await logAuditEvent(session.supabase, {
      userId: session.userId,
      email: session.email,
      event: 'reset_link_issued',
      detail: { for: email },
      ip: clientIp(req),
      userAgent: userAgent(req),
    });

    return NextResponse.json({ link: data.link });
  } catch {
    return NextResponse.json({ error: 'Could not reach the provisioning service.' }, { status: 502 });
  }
}
