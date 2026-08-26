/**
 * Cost guard for Ask AI asked through the PUBLIC share link.
 *
 * A no-login Ask AI endpoint is an open door to unbounded LLM spend, so every
 * share-link question passes through two caps enforced in Postgres
 * (share_ask_allow(), see the share_links_public_view migration) — Postgres,
 * not module memory, because each Vercel lambda has its own module scope and a
 * *global* daily cap has to be shared across all of them.
 *
 * ---- TO CHANGE THE CAPS ----
 * Either edit the two defaults below, or (no redeploy of this file needed) set
 * the Vercel environment variables SHARE_ASK_PER_IP_HOUR / SHARE_ASK_GLOBAL_DAY
 * and redeploy. The values are passed into the SQL function as parameters, so
 * no database migration is ever required to retune them.
 *
 * Signed-in users are unaffected — they keep the existing per-IP/per-user
 * in-memory limits in src/app/api/ask/route.ts.
 */

function intFromEnv(raw: string | undefined, fallback: number): number {
  const n = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Questions per hour, per source IP, through the share link. */
export const SHARE_ASK_PER_IP_HOUR = intFromEnv(process.env.SHARE_ASK_PER_IP_HOUR, 10);

/** Questions per rolling 24h across ALL share-link visitors combined. */
export const SHARE_ASK_GLOBAL_DAY = intFromEnv(process.env.SHARE_ASK_GLOBAL_DAY, 200);

/** Shown when the shared view's whole-day budget is spent. */
export const SHARE_ASK_GLOBAL_MESSAGE =
  'The shared view has reached its question limit for today — please try later.';

/** Shown when this particular visitor has been asking very quickly. */
export const SHARE_ASK_IP_MESSAGE =
  'The shared view has reached its question limit for now — please try again in a little while.';
