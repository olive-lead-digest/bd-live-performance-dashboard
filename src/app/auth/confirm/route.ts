import { NextRequest, NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Landing point for every emailed / issued auth link:
 *   - one-time setup + admin-issued reset links:  ?token_hash=…&type=recovery
 *     (token_hash flow — verified directly against Supabase, no dependency on
 *     the project's redirect allowlist)
 *   - Supabase "forgot password" emails (PKCE):   ?code=…
 * On success the session lands in httpOnly cookies and the user is sent to
 * `next` (default /reset-password -> set a new password). On failure they land
 * on /login with a clear "link expired" message.
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') || '/reset-password';
  // Only ever redirect within this app.
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/reset-password';

  const supabase = await createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(safeNext, url.origin));
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(safeNext, url.origin));
  }

  return NextResponse.redirect(new URL('/login?error=link', url.origin));
}
