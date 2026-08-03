import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 4;
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
 * Self-service password reset: asks Supabase to email the user a recovery
 * link that lands on /auth/confirm -> /reset-password. The response is ALWAYS
 * the same generic acknowledgement — it never confirms whether an account
 * exists (no user enumeration).
 *
 * NOTE: the email's redirect only works once the Supabase project's Site URL /
 * redirect allowlist includes the production domain (a one-time dashboard
 * setting — see ACCESS_SETUP.md). Until then, the admin "reset link" tool on
 * /admin/activity is the reliable path.
 */
export async function POST(req: NextRequest) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
  if (rateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests — please wait a moment and try again.' }, { status: 429 });
  }

  let body: { email?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const redirectTo = `${req.nextUrl.origin}/auth/confirm?next=${encodeURIComponent('/reset-password')}`;
    await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  } catch {
    /* deliberately swallowed — the response below is identical either way */
  }

  return NextResponse.json({
    ok: true,
    message: 'If that address has dashboard access, a reset email is on its way.',
  });
}
