import { NextRequest, NextResponse } from 'next/server';
import {
  SHARE_COOKIE,
  SHARE_COOKIE_MAX_AGE,
  logShareEvent,
  resolveShareToken,
  shareGuessBlocked,
  shareGuessFailed,
  touchShareToken,
} from '@/lib/share';
import { clientIp, userAgent } from '@/lib/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Landing point for the public share link. The path segment is EITHER value
 * that identifies the one live link:
 *     /share/olive-bd                  <- the short admin-editable slug
 *     /share/<43-char random token>    <- the original token, never retired
 *
 * Exchanges it for an httpOnly cookie and redirects to the dashboard, so:
 *   - it stops being visible in the address bar / browser history /
 *     screen shares after the first hop;
 *   - browser JS can never read it (httpOnly), so an XSS could not exfiltrate
 *     the share link itself;
 *   - the referrer of subsequent requests never leaks it.
 * The cookie stores exactly what the visitor arrived with, so someone who was
 * sent the slug never learns the long random token.
 *
 * The cookie is NOT a session: it grants no user identity, no Supabase JWT and
 * no admin surface (see src/proxy.ts, which hard-blocks /admin/* for share
 * traffic). Validity is re-checked in Postgres on every single request, so a
 * revoked link dies immediately even though the cookie is still in the browser.
 *
 * An unknown / revoked value renders a plain "link is no longer active" page —
 * deliberately identical for both cases, so this endpoint can't be used to
 * distinguish "wrong value" from "revoked link".
 *
 * Because the slug is deliberately short and guessable, WRONG values are
 * throttled per IP in Postgres (share_guess_failed). Correct values are never
 * counted, so no real visitor is ever slowed down or locked out.
 */

/** Belt and braces with next.config.ts: a guessable URL must never be
 *  indexed. Also see src/app/robots.ts, which disallows /share/ outright. */
const NOINDEX_HEADERS = {
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Cache-Control': 'no-store',
} as const;

function shellPage(heading: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>Olive Hospitality — ${heading}</title>
<style>
  html, body { margin: 0; padding: 0; height: 100%; }
  body {
    background-color: #0e0e11;
    color: #e8e6ef;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Outfit", "DM Sans", sans-serif;
    display: flex; align-items: center; justify-content: center;
    min-height: 100dvh; padding: 16px; -webkit-font-smoothing: antialiased;
  }
  .wrap { width: 100%; max-width: 380px; }
  .brand { text-align: center; margin-bottom: 32px; }
  .brand .name { font-size: 18px; font-weight: 800; color: #ffffff; letter-spacing: 0.02em; }
  .brand .sub { font-size: 14px; font-weight: 700; color: #ffffff; margin-top: 12px; }
  .panel {
    background-color: rgba(22, 21, 26, 0.8); backdrop-filter: blur(20px);
    border: 1px solid #2a2930; border-radius: 16px; padding: 32px;
    box-shadow: 0 25px 50px -12px rgba(0,0,0,0.6); text-align: center;
  }
  .panel p { font-size: 13px; color: #a8a6b4; margin: 0; line-height: 1.6; }
  a { color: #ec4899; text-decoration: none; font-weight: 600; }
  .footer { text-align: center; font-size: 11px; color: #a8a6b4; margin-top: 24px; }
</style>
</head>
<body>
  <div class="wrap">
    <div class="brand">
      <div class="name">Olive Hospitality</div>
      <h1 class="sub">${heading}</h1>
    </div>
    <div class="panel">
      <p>${body}</p>
    </div>
    <p class="footer">Olive Hospitality — BD Live Performance Dashboard</p>
  </div>
</body>
</html>`;
}

function deadLinkPage(): string {
  return shellPage(
    'This shared link is no longer active',
    'The link you opened has been turned off or has been replaced with a newer one.<br /><br />Please ask whoever shared it with you for the current link, or <a href="/login">sign in</a> if you have an account.'
  );
}

function throttledPage(): string {
  return shellPage(
    'Too many attempts',
    'Too many incorrect links have been tried from this network. Please wait about ten minutes and try again.<br /><br />If you have the correct link and are still seeing this, <a href="/login">sign in</a> instead.'
  );
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const ip = clientIp(req);
  const ua = userAgent(req);

  // Already in cooldown from earlier wrong guesses? Refuse before we even look
  // the value up, so the cooldown cannot be probed for free.
  if (await shareGuessBlocked(ip)) {
    return new NextResponse(throttledPage(), {
      status: 429,
      headers: { ...NOINDEX_HEADERS, 'Content-Type': 'text/html; charset=utf-8', 'Retry-After': '600' },
    });
  }

  const share = await resolveShareToken(token);
  if (!share) {
    // WRONG value — and only a wrong value — moves the per-IP counter.
    const nowBlocked = await shareGuessFailed(ip, ua);
    return new NextResponse(nowBlocked ? throttledPage() : deadLinkPage(), {
      status: nowBlocked ? 429 : 403,
      headers: {
        ...NOINDEX_HEADERS,
        'Content-Type': 'text/html; charset=utf-8',
        ...(nowBlocked ? { 'Retry-After': '600' } : {}),
      },
    });
  }

  // Count the visit and write the audit row before handing over access.
  await touchShareToken(share.token);
  await logShareEvent(share.token, 'share_visit', { label: share.label }, ip, ua);

  const res = NextResponse.redirect(new URL('/', req.nextUrl.origin));
  res.headers.set('X-Robots-Tag', NOINDEX_HEADERS['X-Robots-Tag']);
  res.cookies.set(SHARE_COOKIE, share.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SHARE_COOKIE_MAX_AGE,
  });
  return res;
}
