import type { NextConfig } from "next";

/*
 * Security headers (defense in depth on top of the auth proxy):
 *  - CSP locked to self + the Supabase project (XHR/auth). Next.js needs
 *    'unsafe-inline' script/style without a nonce pipeline; 'unsafe-eval' is
 *    appended in dev only (React Refresh needs it, production does not).
 *  - HSTS, no-sniff, frame denial, tight referrer + permissions policies.
 *
 * P0-5 — force HTML/dynamic responses uncacheable at the edge/browser so a
 * navigation always fetches the current build, while EXCLUDING Next's immutable
 * content-hashed build assets so they keep their long-lived cache.
 */
const SUPABASE_ORIGIN = "https://bihqperphtxromsglyww.supabase.co";
const isDev = process.env.NODE_ENV === "development";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${SUPABASE_ORIGIN}`,
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      {
        source: "/((?!_next/static|_next/image).*)",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
        ],
      },
      /*
       * The public share link now carries a short, memorable, deliberately
       * guessable slug (/share/olive-bd) alongside the original random token.
       * Guessable is acceptable; INDEXED is not — a crawler that finds the URL
       * anywhere would hand it to everyone. noindex/nofollow on the whole
       * /share surface, backed by the /share/ disallow in src/app/robots.ts
       * and the same header set again inside the route handler. This costs a
       * real visitor nothing: it is read only by crawlers.
       */
      {
        source: "/share/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
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
