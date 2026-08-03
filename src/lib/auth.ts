import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from './supabase/server';

export type Role = 'admin' | 'leadership' | 'region_head';

export type Profile = {
  user_id: string;
  name: string;
  email: string;
  role: Role;
  regions: string[] | null;
};

export type Scope = { full: true } | { full: false; regions: string[] };

export type SessionProfile = {
  userId: string;
  email: string;
  profile: Profile;
  /** The caller's OWN authenticated Supabase client (cookie session). Reused
   *  by audit writes so every audit_log insert runs as the user under RLS
   *  (insert allowed only where user_id = auth.uid()) — no service-role key
   *  exists anywhere in this app or its environment. */
  supabase: SupabaseClient;
};

/**
 * Resolves the current session's user + profile row, server-side, from the
 * httpOnly session cookie. Returns null when unauthenticated OR when the
 * profile row is missing — fails CLOSED (no access) rather than assuming
 * full access when something is unexpected.
 */
export async function getSessionProfile(): Promise<SessionProfile | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;
  const userId = data.claims.sub as string;

  const { data: profile, error: profileErr } = await supabase
    .from('user_profiles')
    .select('user_id, name, email, role, regions')
    .eq('user_id', userId)
    .single();

  if (profileErr || !profile) return null;
  return { userId, email: profile.email, profile: profile as Profile, supabase };
}

/** Never trust a client-supplied region claim — scope is always derived here,
 *  server-side, from the caller's own profile row. admin and leadership see
 *  everything; region_head is restricted to their regions[]. */
export function scopeFromProfile(profile: Profile): Scope {
  if (profile.role === 'admin' || profile.role === 'leadership') return { full: true };
  return { full: false, regions: profile.regions || [] };
}

/** Human badge for the signed-in chip: "Admin", "Leadership", or the region
 *  list for a region head. */
export function roleLabel(profile: Profile): string {
  if (profile.role === 'admin') return 'Admin · all regions';
  if (profile.role === 'leadership') return 'Leadership · all regions';
  return (profile.regions || []).join(' · ') || 'Region head';
}
