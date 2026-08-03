import { NextRequest, NextResponse } from 'next/server';
import { getSessionProfile } from '@/lib/auth';
import { logAuditEvent, clientIp, userAgent } from '@/lib/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Client-triggered audit beacon for events that originate in the browser
 * (page navigations, report/export downloads). Restricted to an allowlist so
 * a client can never spoof a login/ask_question/feed_access row — those are
 * only ever written server-side inside their own routes. The acting identity
 * is ALWAYS resolved from the session server-side; anything the client claims
 * about who it is gets ignored.
 */
const ALLOWED = new Set(['page_view', 'report_export']);

export async function POST(req: NextRequest) {
  const session = await getSessionProfile();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

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

  await logAuditEvent(session.supabase, {
    userId: session.userId,
    email: session.email,
    event: event as 'page_view' | 'report_export',
    detail,
    ip: clientIp(req),
    userAgent: userAgent(req),
  });

  return NextResponse.json({ ok: true });
}
