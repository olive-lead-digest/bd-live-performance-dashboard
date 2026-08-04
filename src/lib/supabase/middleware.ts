import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://bihqperphtxromsglyww.supabase.co';
const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_LBIcygJp_4ah7e0x4LMVNw_Vhpdnl0i';

export type ProxySessionUser = { id: string; email?: string; passwordSet: boolean };

/**
 * Refreshes the Supabase session cookie on every request and resolves the
 * caller's identity in one pass. Used by src/proxy.ts (Next.js 16 renamed
 * middleware.ts -> proxy.ts — see AGENTS.md).
 *
 * Uses NextRequest/NextResponse cookie adapters, NOT next/headers (which is
 * for Server Components/Route Handlers only and isn't available in Proxy).
 *
 * `passwordSet` reflects user_profiles.password_set_at (queried under RLS as
 * the caller — the user_profiles_select_own policy allows exactly this row).
 * A valid session does NOT imply a real password has ever been saved: the
 * recovery/setup flow (verifyOtp on /auth/confirm) establishes a session
 * BEFORE the user submits a new password on /reset-password. If they never
 * submit it, passwordSet stays false and src/proxy.ts forces them back to
 * /reset-password on every other route — see the Aug 2026 lockout incident
 * (dhruv@, shreedhar.a@) this closes.
 */
export async function updateSession(
  request: NextRequest
): Promise<{ response: NextResponse; user: ProxySessionUser | null }> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getClaims validates the JWT signature (locally, against the project's
  // published keys) — never trust getSession() in Proxy, it isn't guaranteed
  // to revalidate the token.
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return { response, user: null };

  const userId = data.claims.sub as string;

  // Fail closed: if the profile row can't be read for any reason, treat the
  // password as NOT set (forces the reset-password gate rather than silently
  // granting access).
  let passwordSet = false;
  try {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('password_set_at')
      .eq('user_id', userId)
      .single();
    passwordSet = !!profile?.password_set_at;
  } catch {
    passwordSet = false;
  }

  return {
    response,
    user: { id: userId, email: data.claims.email as string | undefined, passwordSet },
  };
}
