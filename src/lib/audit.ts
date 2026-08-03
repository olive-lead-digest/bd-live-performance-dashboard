import type { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Audit trail — every write happens SERVER-SIDE with the calling user's OWN
 * session client, under RLS:
 *   - audit_log INSERT is only allowed to authenticated users with
 *     user_id = auth.uid() (a user can only ever write their own rows);
 *   - SELECT is admin-role only; UPDATE/DELETE are impossible for everyone
 *     (no policies + revoked) — the log is immutable;
 *   - failed logins (no session exists) go through the SECURITY DEFINER
 *     Postgres function log_login_failed, the single anon-writable path,
 *     which can only produce a fixed-shape login_failed row.
 *
 * There is deliberately NO service-role key in this app or its environment.
 */

export type AuditEvent =
  | 'login_success'
  | 'login_failed'
  | 'logout'
  | 'page_view'
  | 'ask_question'
  | 'report_export'
  | 'feed_access'
  | 'password_set'
  | 'reset_link_issued';

export function clientIp(req: Request | NextRequest): string {
  const h = req.headers;
  return (
    h.get('x-nf-client-connection-ip') ||
    (h.get('x-forwarded-for') || '').split(',')[0].trim() ||
    h.get('x-real-ip') ||
    'unknown'
  );
}

export function userAgent(req: Request | NextRequest): string {
  return req.headers.get('user-agent') || 'unknown';
}

/**
 * Best-effort append of one audit row AS THE CALLER. Never throws — a logging
 * failure must never break login/Ask AI/navigation/export for the user.
 * Failures are reported to console only.
 */
export async function logAuditEvent(
  supabase: SupabaseClient,
  entry: {
    userId: string;
    email?: string | null;
    event: AuditEvent;
    detail?: Record<string, unknown>;
    ip?: string;
    userAgent?: string;
  }
): Promise<void> {
  try {
    const { error } = await supabase.from('audit_log').insert({
      user_id: entry.userId,
      email: entry.email ?? null,
      event: entry.event,
      detail: entry.detail ?? {},
      ip: entry.ip ?? null,
      user_agent: entry.userAgent ?? null,
    });
    if (error) console.error('[audit] insert failed:', error.message);
  } catch (e) {
    console.error('[audit] logging unavailable:', e instanceof Error ? e.message : e);
  }
}

/** Failed sign-in (no session): recorded via the anon-executable SECURITY
 *  DEFINER function — the only unauthenticated write path into the log. */
export async function logLoginFailed(
  supabase: SupabaseClient,
  email: string,
  reason: string,
  ip: string,
  ua: string
): Promise<void> {
  try {
    const { error } = await supabase.rpc('log_login_failed', {
      p_email: email,
      p_reason: reason,
      p_ip: ip,
      p_user_agent: ua,
    });
    if (error) console.error('[audit] login_failed rpc failed:', error.message);
  } catch (e) {
    console.error('[audit] login_failed logging unavailable:', e instanceof Error ? e.message : e);
  }
}
