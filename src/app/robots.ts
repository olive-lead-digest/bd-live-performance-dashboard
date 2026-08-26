import type { MetadataRoute } from 'next';

/**
 * /robots.txt
 *
 * The whole dashboard is behind a login, so nothing here is crawlable anyway —
 * but the public share link is different: it is reachable with no login and,
 * now that it carries a short memorable slug (/share/olive-bd) instead of only
 * a 43-character random token, it is short enough to be pasted into places
 * crawlers reach. An indexed share URL would turn "guessable" into "listed on
 * Google", which is the one failure mode the slug decision has to avoid.
 *
 * So: disallow everything, and call out /share/ explicitly. This is paired
 * with the `X-Robots-Tag: noindex, nofollow` response header set on /share/*
 * in next.config.ts and again in the route handler itself — robots.txt asks
 * politely, the header is what actually keeps the URL out of an index if a
 * crawler ignores the file.
 *
 * Neither costs a real visitor anything: robots.txt is only read by crawlers.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        disallow: ['/share/', '/admin/', '/api/', '/'],
      },
    ],
  };
}
