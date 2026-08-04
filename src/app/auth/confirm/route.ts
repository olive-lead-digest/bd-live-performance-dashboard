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
 * This also covers ?type=invite / ?type=email links — same token_hash shape,
 * same handler, same GET/POST split below.
 *
 * SECURITY — GET must NEVER consume the one-time token. Corporate/webmail
 * link-scanners (Google Workspace Safe Browsing, Microsoft Defender Safe
 * Links, AV email gateways) automatically fetch every URL in an email before
 * a human clicks it, to scan for malware. If GET called verifyOtp() /
 * exchangeCodeForSession() directly, that automated prefetch silently burns
 * the one-time token — the real recipient's click then fails with
 * "otp_expired" / "token not found" even though the link is only seconds old.
 * (Confirmed root cause of the Aug 2026 setup/reset-link incident via
 * Supabase auth logs: real users' tokens were being invalidated ~1h after
 * issue, well inside the 24h expiry window, immediately followed by
 * Supabase's own mail.send recovery re-send once they hit "forgot password".)
 *
 * Fix: GET renders a static "click to continue" page and does NOT touch
 * Supabase. Only the POST that page's button submits (a real form
 * submission — scanners do not execute JS or submit forms) calls
 * verifyOtp()/exchangeCodeForSession(), sets the session cookie, and
 * redirects to `next`. A genuinely expired/already-used token still fails
 * cleanly at that point, sending the user to /login with guidance.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeNextPath(next: string | null): string {
  if (next && next.startsWith('/') && !next.startsWith('//')) return next;
  return '/reset-password';
}

function renderContinuePage(params: { tokenHash: string | null; type: string | null; code: string | null; next: string }) {
  const { tokenHash, type, code, next } = params;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>Olive Hospitality — Continue</title>
<style>
  html, body { margin: 0; padding: 0; height: 100%; }
  body {
    background-color: #0e0e11;
    color: #e8e6ef;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Outfit", "DM Sans", sans-serif;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100dvh;
    padding: 16px;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { width: 100%; max-width: 380px; }
  .brand { text-align: center; margin-bottom: 32px; }
  .brand .name { font-size: 18px; font-weight: 800; color: #ffffff; letter-spacing: 0.02em; }
  .brand .sub { font-size: 14px; font-weight: 700; color: #ffffff; margin-top: 12px; }
  .brand .hint { font-size: 13px; color: #a8a6b4; margin-top: 4px; }
  .panel {
    background-color: rgba(22, 21, 26, 0.8);
    backdrop-filter: blur(20px);
    border: 1px solid #2a2930;
    border-radius: 16px;
    padding: 32px;
    box-shadow: 0 25px 50px -12px rgba(0,0,0,0.6);
    text-align: center;
  }
  .panel p { font-size: 13px; color: #a8a6b4; margin: 0 0 20px; line-height: 1.5; }
  button {
    width: 100%;
    border: none;
    border-radius: 8px;
    background-color: #da1a84;
    color: #ffffff;
    font-weight: 700;
    font-size: 14px;
    padding: 12px;
    cursor: pointer;
    transition: background-color 0.15s ease;
  }
  button:hover { background-color: #ec4899; }
  .footer { text-align: center; font-size: 11px; color: #a8a6b4; margin-top: 24px; }
</style>
</head>
<body>
  <div class="wrap">
    <div class="brand">
      <div class="name">Olive Hospitality</div>
      <h1 class="sub">Continue to your account</h1>
      <p class="hint">Click below to confirm it's you and continue.</p>
    </div>
    <div class="panel">
      <p>For your security, this link needs one click from you before it's used.</p>
      <form method="POST" action="/auth/confirm">
        <input type="hidden" name="token_hash" value="${tokenHash ? escapeHtml(tokenHash) : ''}" />
        <input type="hidden" name="type" value="${type ? escapeHtml(type) : ''}" />
        <input type="hidden" name="code" value="${code ? escapeHtml(code) : ''}" />
        <input type="hidden" name="next" value="${escapeHtml(next)}" />
        <button type="submit">Click to continue</button>
      </form>
    </div>
    <p class="footer">Internal tool — access is limited to authorised Olive Hospitality BD staff.</p>
  </div>
</body>
</html>`;
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  const code = url.searchParams.get('code');
  const next = safeNextPath(url.searchParams.get('next'));

  // Nothing to confirm — bounce to /login immediately. No token is at risk
  // here, so there is nothing an automated prefetch could burn.
  if (!((tokenHash && type) || code)) {
    return NextResponse.redirect(new URL('/login?error=link', url.origin));
  }

  // Render the human-interaction gate. Deliberately does NOT call
  // verifyOtp()/exchangeCodeForSession() — that only happens on the POST
  // below, which only a real click (form submit) can trigger.
  const html = renderContinuePage({ tokenHash, type, code, next });
  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export async function POST(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const form = await req.formData();
  const tokenHash = (form.get('token_hash') as string | null) || null;
  const type = (form.get('type') as string | null) || null;
  const code = (form.get('code') as string | null) || null;
  const next = safeNextPath((form.get('next') as string | null) || null);

  const supabase = await createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type: type as EmailOtpType, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, origin), 303);
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin), 303);
  }

  return NextResponse.redirect(new URL('/login?error=link', origin), 303);
}
