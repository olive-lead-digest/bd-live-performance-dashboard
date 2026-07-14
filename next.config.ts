import type { NextConfig } from "next";

/*
 * P0-5 — force HTML/dynamic responses uncacheable at the edge/browser so a
 * navigation always fetches the current build, while EXCLUDING Next's immutable
 * content-hashed build assets so they keep their long-lived cache.
 */
const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/((?!_next/static|_next/image).*)",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
        ],
      },
    ];
  },
  /*
   * P2-2 — 10 routes consolidated to 7. Old routes 301 to their new homes.
   * Next.js forwards any incoming query string (filters, ?brand=) to the
   * destination, so shareable filter links and Workstream-B URL state survive.
   */
  async redirects() {
    return [
      { source: "/pipeline", destination: "/deals?view=pipeline", permanent: true },
      { source: "/leaderboard", destination: "/team", permanent: true },
      { source: "/ranking", destination: "/team?tab=ranking", permanent: true },
      { source: "/compare", destination: "/team?tab=compare", permanent: true },
      { source: "/performance", destination: "/portfolio", permanent: true },
      { source: "/reporting", destination: "/analytics", permanent: true },
      // R-0 — the standalone Directory section was removed. Its old route
      // permanently redirects to Overview so the URL is never a dead reachable
      // page (decision: redirect to Overview, not a 404).
      { source: "/directory", destination: "/", permanent: true },
    ];
  },
};

export default nextConfig;
