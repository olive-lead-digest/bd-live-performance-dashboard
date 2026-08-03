import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logAuditEvent, logLoginFailed, clientIp, userAgent } from '@/lib/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 8;
const hits = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > MAX_PER_WINDOW;
}

/**
 * Server-side sign-in. Runs on the server so the outcome is audit-logged
 * authoritatively (login_success / login_failed) — the client is never
 * trusted to report either. Session lands in httpOnly cookies via
 * @supabase/ssr.
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const ua = userAgent(req);
  if (rateLimited(ip)) {
    return NextResponse.json({ error: 'Too many attempts — please wait a moment and try again.' }, { status: 429 });
  }

  let body: { email?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !password) {
    return NextResponse.json({ error: 'Enter your email and password.' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data?.user) {
    // Recorded via the SECURITY DEFINER fn (no session exists on failure).
    await logLoginFailed(supabase, email, error?.message || 'unknown', ip, ua);
    // Deliberately generic — never reveals whether the email exists.
    return NextResponse.json({ error: 'Incorrect email or password.' }, { status: 401 });
  }

  // The same client now holds the fresh session, so this insert runs AS the
  // user and satisfies the audit_log RLS insert policy.
  await logAuditEvent(supabase, {
    userId: data.user.id,
    email,
    event: 'login_success',
    detail: {},
    ip,
    userAgent: ua,
  });
  return NextResponse.json({ ok: true });
}
