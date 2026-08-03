/**
 * REMOVED — this app deliberately has NO service-role client.
 *
 * The v1 design wrote audit rows with a service-role key held in a Vercel
 * env var. The shipped architecture keeps the service-role key out of the
 * app and its environment entirely:
 *   - audit_log writes run as the calling user under RLS (see lib/audit.ts);
 *   - the admin activity page reads audit_log via the admin's own session
 *     (RLS SELECT policy gated on role = 'admin');
 *   - account provisioning / recovery links live in a Supabase Edge Function
 *     (service role is auto-injected there, server-side at Supabase, and the
 *     function verifies the caller is an admin before doing anything).
 *
 * This file intentionally exports nothing. It exists only because the build
 * environment cannot delete files; nothing imports it.
 */
export {};
