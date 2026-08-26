import { NextResponse } from 'next/server';
import { SHARE_COOKIE } from '@/lib/share';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * "Exit shared view" — drops the share cookie. Nothing is authenticated here
 * because nothing needs to be: clearing your own cookie is not a privileged
 * action, and it grants nothing.
 */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SHARE_COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
  return res;
}
