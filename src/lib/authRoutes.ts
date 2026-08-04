/**
 * The routes that make up the auth surface (sign-in, password reset, emailed
 * link confirm). Shared by the client chrome (AppShell renders these bare —
 * no sidebar / filter bar / beacons) and the data layer (DashboardContext
 * never fetches protected APIs here, and never redirects to /login while an
 * auth page is already in front of the user). Keeping those two in lockstep
 * is what prevents the /login reload loop. src/proxy.ts keeps its own
 * matching isPublic() list (it additionally whitelists /api/auth/*).
 */
export function isAuthRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return (
    pathname === '/login' ||
    pathname.startsWith('/login/') ||
    pathname === '/reset-password' ||
    pathname.startsWith('/reset-password/') ||
    pathname === '/auth' ||
    pathname.startsWith('/auth/')
  );
}
