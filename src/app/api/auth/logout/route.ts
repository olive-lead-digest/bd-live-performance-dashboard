import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logAuditEvent, clientIp, userAgent } from '@/lib/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  const email = data?.claims?.email as string | undefined;

  // Log BEFORE signOut — the insert must run while the caller still has a
  // session (audit_log RLS only allows a user to write their own rows).
  if (userId) {
    await logAuditEvent(supabase, {
      userId,
      email,
      event: 'logout',
      detail: {},
      ip: clientIp(req),
      userAgent: userAgent(req),
    });
  }

  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
