import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://bihqperphtxromsglyww.supabase.co';
const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_LBIcygJp_4ah7e0x4LMVNw_Vhpdnl0i';

/**
 * Server-side Supabase client for Server Components, Route Handlers and
 * Server Actions. Reads/writes the session via httpOnly cookies (next/headers)
 * so the raw tokens are never readable from browser JS. Uses the
 * publishable/anon key + RLS — no service-role key exists anywhere in this
 * app or its environment.
 */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, which cannot set cookies — the
          // proxy (src/proxy.ts) already refreshes the session cookie on
          // every request, so this is safe to ignore here.
        }
      },
    },
  });
}
