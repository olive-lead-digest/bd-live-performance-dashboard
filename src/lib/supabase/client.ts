'use client';

import { createBrowserClient } from '@supabase/ssr';

// Public, safe-to-ship values — a publishable/anon key is DESIGNED to be
// public (access is governed by RLS, not by keeping this secret). Hardcoded
// fallbacks match the existing convention in this codebase (see
// DEFAULT_DATA_URL etc. in src/app/api/dashboard/route.ts) so the app keeps
// working even before Vercel env vars are configured; real env vars, when
// present, always take priority.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://bihqperphtxromsglyww.supabase.co';
const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_LBIcygJp_4ah7e0x4LMVNw_Vhpdnl0i';

/** Browser-side Supabase client. Session cookies are managed by the server
 *  client + proxy instead (httpOnly) — this client is only for client
 *  components that need to call Supabase directly (the /reset-password page
 *  uses it to convert an implicit-flow recovery link's hash tokens into a
 *  cookie session; auth itself is always performed server-side so cookies
 *  stay httpOnly). */
export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
}
