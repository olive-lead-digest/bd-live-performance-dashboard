/*
 * P1-9 (1) — Ask AI relevance guard.
 *
 * Shared by the client (HeroAsk) and the server (api/ask/route.ts) so it cannot
 * be trivially bypassed. The goal is narrow: block obvious garbage /
 * off-topic input ("asdfgh qwerty zzz") from reaching the LLM and producing a
 * confident, fabricated answer — WITHOUT blocking legitimate short questions
 * like "top BDs?" or "Spark LOIs?".
 *
 * A query is considered relevant if any of its word-tokens matches a BD-domain
 * signal: a metric/dimension keyword, a brand, a region, a month, or a common
 * question/analytics word. Pure gibberish matches none of these → fallback.
 */

// Metric / entity / dimension vocabulary the BD dataset actually exposes.
const KEYWORDS = new Set<string>([
  'bd', 'bds', 'rep', 'reps', 'owner', 'owners', 'team', 'director', 'head', 'heads',
  'lead', 'leads', 'deal', 'deals', 'sign', 'signed', 'signing', 'signings', 'signup',
  'proposal', 'proposals', 'approval', 'approved', 'reject', 'rejected', 'pending',
  'drop', 'dropped', 'drops', 'rate', 'rates', 'pipeline', 'funnel', 'stage', 'stages',
  'conversion', 'convert', 'converted', 'collection', 'collections', 'collected',
  'contract', 'contracted', 'key', 'keys', 'loi', 'lois', 'ma', 'mas', 'moa',
  'active', 'contacted', 'contact', 'won', 'win', 'lost', 'loss', 'closed',
  'tier', 'tiers', 'region', 'regions', 'brand', 'brands', 'city', 'cities',
  'state', 'states', 'cluster', 'clusters', 'property', 'properties', 'hotel', 'hotels',
  'revenue', 'arr', 'occupancy', 'occ', 'gmv', 'value',
  'performance', 'perform', 'performing', 'performer', 'performers', 'productivity',
  'rank', 'ranking', 'rankings', 'ranked', 'leaderboard', 'score', 'scores', 'points',
  'top', 'best', 'worst', 'lowest', 'highest', 'bottom', 'leader', 'leaders', 'laggard',
  'quarter', 'quarterly', 'month', 'monthly', 'mtd', 'ytd', 'qtd', 'fiscal', 'fy',
  'week', 'weekly', 'daily', 'year', 'yearly', 'trend', 'trending', 'trends', 'growth',
  'zoom', 'call', 'calls', 'connect', 'connected', 'source', 'sources',
  'target', 'targets', 'quota', 'forecast', 'upcoming', 'compare', 'comparison',
  'breakdown', 'split', 'share', 'total', 'count', 'number', 'numbers', 'many',
]);

// Brands the dashboard tracks (Olive / Spark / Open Hotels).
const BRANDS = new Set<string>(['olive', 'spark', 'open']);

// Regions + common sub-region tokens.
const REGIONS = new Set<string>([
  'north', 'south', 'east', 'west', 'central', 'northeast', 'northwest',
  'southeast', 'southwest', 'ncr', 'delhi', 'mumbai', 'bangalore', 'bengaluru',
  'hyderabad', 'chennai', 'pune', 'kolkata', 'goa',
]);

const MONTHS = new Set<string>([
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
]);

// Common English question / analytics connectors — keep legitimate phrasing
// ("how is X doing", "who are the ...", "show me ...") out of the block list.
const QUESTION_WORDS = new Set<string>([
  'how', 'what', 'who', 'which', 'where', 'when', 'why', 'whom', 'whose',
  'is', 'are', 'was', 'were', 'do', 'does', 'did', 'has', 'have', 'had',
  'show', 'give', 'tell', 'list', 'find', 'get', 'display', 'summarise', 'summarize',
  'me', 'my', 'our', 'us', 'the', 'a', 'an', 'of', 'in', 'on', 'by', 'for', 'to',
  'and', 'or', 'vs', 'versus', 'per', 'across', 'over', 'this', 'that', 'each',
  'doing', 'tracking', 'track', 'looking', 'look', 'status', 'update', 'about',
]);

// P0-1 — suggestions offered when a query can't be mapped. All are grounded and
// answerable now that the assistant sees leads + signings/deals + proposals.
export const ASK_SUGGESTIONS: string[] = [
  'How many MAs has Spark signed?',
  'Collections this financial year?',
  'Top BDs by signings?',
  'Best active-rate region?',
];

/**
 * Returns true when the query carries at least one BD-relevant signal.
 * Lenient by design: only pure gibberish / off-topic input returns false.
 */
export function isRelevantQuery(raw: string): boolean {
  const q = (raw || '').toLowerCase();
  // Tokenise on non-alphanumerics; keep alphanumeric tokens of length >= 1.
  const tokens = q.match(/[a-z0-9]+/g) || [];
  if (tokens.length === 0) return false; // e.g. "??? !!!"

  for (const t of tokens) {
    if (KEYWORDS.has(t) || BRANDS.has(t) || REGIONS.has(t) || MONTHS.has(t) || QUESTION_WORDS.has(t)) {
      return true;
    }
    // Pure numbers (years, counts) are legitimate signal alongside other words.
    if (/^\d+$/.test(t)) return true;
  }
  return false;
}
