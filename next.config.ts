import type { NextConfig } from "next";

/*
 * P0-5 — Edge cache served a stale MOCK build.
 * Symptom: the production URL intermittently served a 14-hour-old HTML shell
 * (x-vercel-cache: HIT, age: 50642) despite cache-control: max-age=0.
 *
 * Fix: force HTML documents / dynamic responses to be uncacheable at the
 * edge/browser (no-store, must-revalidate) so a navigation always fetches the
 * current build. The negative lookahead EXCLUDES Next's immutable,
 * content-hashed build assets (/_next/static, /_next/image) so they keep their
 * long-lived immutable cache — sending no-store for those would tank
 * performance and defeat content hashing.
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
};

export default nextConfig;
