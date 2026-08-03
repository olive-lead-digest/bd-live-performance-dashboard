import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://bihqperphtxromsglyww.supabase.co';
const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_LBIcygJp_4ah7e0x4LMVNw_Vhpdnl0i';

export type ProxySessionUser = { id: string; email?: string };

/**
 * Refreshes the Supabase session cookie on every request and resolves the
 * caller's identity in one pass. Used by src/proxy.ts (Next.js 16 renamed
 * middleware.ts -> proxy.ts — see AGENTS.md).
 *
 * Uses NextRequest/NextResponse cookie adapters, NOT next/headers (which is
 * for Server Components/Route Handlers only and isn't available in Proxy).
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

  return {
    response,
    user: { id: data.claims.sub as string, email: data.claims.email as string | undefined },
  };
}
