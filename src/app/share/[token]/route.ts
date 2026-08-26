import { NextRequest, NextResponse } from 'next/server';
import { SHARE_COOKIE, SHARE_COOKIE_MAX_AGE, logShareEvent, resolveShareToken, touchShareToken } from '@/lib/share';
import { clientIp, userAgent } from '@/lib/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Landing point for the public share link:
 *     /share/<43-char random token>
 *
 * Exchanges the token in the URL for an httpOnly cookie and redirects to the
 * dashboard, so:
 *   - the token stops being visible in the address bar / browser history /
 *     screen shares after the first hop;
 *   - browser JS can never read it (httpOnly), so an XSS could not exfiltrate
 *     the share link itself;
 *   - the referrer of subsequent requests never leaks it.
 *
 * The cookie is NOT a session: it grants no user identity, no Supabase JWT and
 * no admin surface (see src/proxy.ts, which hard-blocks /admin/* for share
 * traffic). Validity is re-checked in Postgres on every single request, so a
 * revoked link dies immediately even though the cookie is still in the browser.
 *
 * An unknown / revoked token renders a plain "link is no longer active" page —
 * deliberately identical for both cases, so this endpoint can't be used to
 * distinguish "wrong token" from "revoked token".
 */

function deadLinkPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>Olive Hospitality — Link unavailable</title>
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
      <h1 class="sub">This shared link is no longer active</h1>
    </div>
    <div class="panel">
      <p>The link you opened has been turned off or has been replaced with a newer one.<br /><br />Please ask whoever shared it with you for the current link, or <a href="/login">sign in</a> if you have an account.</p>
    </div>
    <p class="footer">Olive Hospitality — BD Live Performance Dashboard</p>
  </div>
</body>
</html>`;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;

  const share = await resolveShareToken(token);
  if (!share) {
    return new NextResponse(deadLinkPage(), {
      status: 403,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  const ip = clientIp(req);
  const ua = userAgent(req);

  // Count the visit and write the audit row before handing over access.
  await touchShareToken(share.token);
  await logShareEvent(share.token, 'share_visit', { label: share.label }, ip, ua);

  const res = NextResponse.redirect(new URL('/', req.nextUrl.origin));
  res.cookies.set(SHARE_COOKIE, share.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SHARE_COOKIE_MAX_AGE,
  });
  return res;
}
