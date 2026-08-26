import { NextRequest, NextResponse } from 'next/server';
import { getSessionProfile } from '@/lib/auth';
import { logAuditEvent, clientIp, userAgent } from '@/lib/audit';
import { SHARE_COOKIE, logShareEvent, resolveShareToken } from '@/lib/share';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Client-triggered audit beacon for events that originate in the browser
 * (page navigations, report/export downloads). Restricted to an allowlist so
 * a client can never spoof a login/ask_question/feed_access row — those are
 * only ever written server-side inside their own routes. The acting identity
 * is ALWAYS resolved from the session server-side; anything the client claims
 * about who it is gets ignored.
 *
 * Share link: a visitor on a live public share link produces the same two
 * event types, written through the token-gated SECURITY DEFINER function
 * log_share_event() — which can only ever emit user_id = NULL /
 * email = 'shared-link' / detail.via = 'share'. So a share visitor cannot
 * attribute a beacon to a real user, and the ordinary audit_log RLS policies
 * (insert only as yourself, select admin-only, no update/delete) are untouched.
 */
const ALLOWED = new Set(['page_view', 'report_export']);

export async function POST(req: NextRequest) {
  const session = await getSessionProfile();
  const share = session ? null : await resolveShareToken(req.cookies.get(SHARE_COOKIE)?.value);
  if (!session && !share) return NextResponse.json({ ok: false }, { status: 401 });

  let body: { event?: unknown; path?: unknown; query?: unknown; reportType?: unknown; filters?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const event = typeof body.event === 'string' && ALLOWED.has(body.event) ? body.event : 'page_view';
  const detail: Record<string, unknown> =
    event === 'report_export'
      ? {
          reportType: typeof body.reportType === 'string' ? body.reportType.slice(0, 120) : 'unknown',
          filters: body.filters ?? null,
        }
      : {
          path: typeof body.path === 'string' ? body.path.slice(0, 300) : 'unknown',
          query: typeof body.query === 'string' ? body.query.slice(0, 500) : '',
        };

  if (session) {
    await logAuditEvent(session.supabase, {
      userId: session.userId,
      email: session.email,
      event: event as 'page_view' | 'report_export',
      detail,
      ip: clientIp(req),
      userAgent: userAgent(req),
    });
  } else if (share) {
    await logShareEvent(
      share.token,
      event as 'page_view' | 'report_export',
      detail,
      clientIp(req),
      userAgent(req)
    );
  }

  return NextResponse.json({ ok: true });
}
