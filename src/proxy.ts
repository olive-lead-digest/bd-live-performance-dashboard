import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

/**
 * App-wide access gate. EVERYTHING requires a signed-in session except:
 *   /login                 — the sign-in page itself
 *   /auth/confirm          — one-time setup / password-recovery link landing
 *   /reset-password        — set-a-new-password page (needs the recovery
 *                            session the confirm route just established; the
 *                            page fails closed without one)
 *   /api/auth/*            — login / logout / forgot-password endpoints
 *                            (each one independently validates what it needs)
 * Static assets are excluded via the matcher. API routes get a 401 JSON
 * response instead of a redirect. Every protected page/API additionally
 * re-verifies the session server-side — this proxy is the first gate, never
 * the only one.
 *
 * SECOND GATE, same shape as the login gate: a signed-in user who has never
 * actually saved a real password (user_profiles.password_set_at IS NULL —
 * see updateSession()) is treated exactly like an unauthenticated user for
 * every route EXCEPT /reset-password, /auth/*, /login, /api/auth/* — they
 * land on /reset-password instead of /login. This closes the gap where
 * verifyOtp() on a recovery link grants a full session before the user ever
 * types a new password: if they navigate away from /reset-password instead
 * of submitting it, they must not be able to reach anything else.
 */

function isPublic(pathname: string): boolean {
  return (
    pathname === '/login' ||
    pathname.startsWith('/login/') ||
    pathname === '/reset-password' ||
    pathname.startsWith('/reset-password/') ||
    pathname === '/auth/confirm' ||
    pathname.startsWith('/api/auth/')
  );
}

// Routes a password-not-set user may still reach (same list minus the ones
// that only make sense once signed in with a real password — kept identical
// to isPublic() today, factored out separately because the two lists are
// allowed to diverge in future).
function isReachableWithoutPassword(pathname: string): boolean {
  return isPublic(pathname);
}

// Cheap per-IP throttle in front of the auth routes (each route also
// rate-limits — this is a second, even-cheaper layer ahead of it, same
// pattern as the existing IP limiter in api/ask/route.ts).
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
const hits = new Map<string, number[]>();
function authRateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > MAX_PER_WINDOW;
}

// Next.js 16 renamed middleware.ts -> proxy.ts; the exported function must be
// named `proxy`.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    request.method === 'POST' &&
    (pathname === '/api/auth/login' || pathname === '/api/auth/forgot')
  ) {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() || request.headers.get('x-real-ip') || 'unknown';
    if (authRateLimited(ip)) {
      return NextResponse.json({ error: 'Too many attempts — please wait a moment and try again.' }, { status: 429 });
    }
  }

  const { response, user } = await updateSession(request);

  // A signed-in user has no business on /login — send them to the dashboard
  // exactly once, UNLESS they still haven't set a real password, in which
  // case /reset-password is where they belong instead. (/ is protected, the
  // session is present, so it renders immediately: no ping-pong.
  // /reset-password is deliberately NOT redirected: the recovery flow
  // arrives there WITH a session, to set a new password.)
  if (user && (pathname === '/login' || pathname.startsWith('/login/'))) {
    const url = request.nextUrl.clone();
    url.pathname = user.passwordSet ? '/' : '/reset-password';
    url.search = '';
    const redirect = NextResponse.redirect(url);
    // Keep any session cookies updateSession just refreshed onto `response`.
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }

  if (isPublic(pathname)) {
    return response;
  }

  if (!user) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }

  // Signed in, but never actually saved a real password — force the
  // reset-password flow on every other route (the exact same shape as the
  // unauthenticated case above, just landing on /reset-password not /login).
  if (!user.passwordSet && !isReachableWithoutPassword(pathname)) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'You need to set a password before continuing. Please finish the reset-password step.' },
        { status: 401 }
      );
    }
    const url = request.nextUrl.clone();
    url.pathname = '/reset-password';
    url.search = '';
    const redirect = NextResponse.redirect(url);
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|json|ico|txt)$).*)'],
};
