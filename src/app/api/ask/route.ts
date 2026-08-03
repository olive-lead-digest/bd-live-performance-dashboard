import { NextRequest, NextResponse } from 'next/server';
import { isRelevantQuery, ASK_SUGGESTIONS } from '@/lib/askGuard';
import { getSessionProfile, scopeFromProfile, type Scope } from '@/lib/auth';
import { logAuditEvent, userAgent } from '@/lib/audit';

/*
 * Ask-AI proxy. AUTH REQUIRED. The browser posts { question, context } here;
 * this server-side function resolves the caller's session + region scope
 * (never trusting any client-supplied region claim), forwards
 * { question, context, scope } to the n8n webhook (URL kept in
 * N8N_ASK_WEBHOOK_URL, never exposed to the client), and returns n8n's
 * { answer, sources }. n8n's Merge Feeds Code node filters every
 * region-attributable array by `scope` before building the prompt, so a
 * region-scoped caller's answer/table/chart can never surface another
 * region's numbers even if asked by name.
 *
 * Protections: rejects empty questions, same-origin only, best-effort per-IP rate
 * limit. No secrets in the client bundle.
 *
 * Cost control: a lightweight in-memory semantic cache. Repeated or near-duplicate
 * questions (same hourly feed version) are served from memory WITHOUT calling n8n
 * or the model — 0 upstream tokens. The cache is per warm serverless instance
 * (module scope), so no new infra; it self-expires when the hour bucket changes.
 * The cache key is scoped by the caller's access scope (full vs. the exact
 * region set) so a full-access answer can never be served to a region-scoped
 * caller, or one region's cached answer to a different region's head.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 8; // a few questions/min per IP
const MAX_PER_WINDOW_USER = 6; // and per signed-in user, regardless of IP
const MAX_QUESTION_LEN = 600;

// Shared secret sent to the n8n webhook so the workflow can reject direct
// calls from anyone who discovers the webhook URL (which would otherwise
// bypass login AND region scoping). Overridable via env; the fallback keeps
// things working before the Vercel env var is configured.
const ASK_SHARED_SECRET =
  process.env.ASK_SHARED_SECRET || '1702958079e6ef6791b37bbf39a55c80a8b3b8695ff96590';

// Best-effort in-memory limiters (per warm serverless instance).
const hits = new Map<string, number[]>();
const userHits = new Map<string, number[]>();

function limited(map: Map<string, number[]>, key: string, max: number): boolean {
  const now = Date.now();
  const arr = (map.get(key) || []).filter(t => now - t < WINDOW_MS);
  arr.push(now);
  map.set(key, arr);
  if (map.size > 5000) map.clear(); // guard against unbounded growth
  return arr.length > max;
}

function rateLimited(ip: string): boolean {
  return limited(hits, ip, MAX_PER_WINDOW);
}

function userRateLimited(userId: string): boolean {
  return limited(userHits, userId, MAX_PER_WINDOW_USER);
}

function clientIp(req: NextRequest): string {
  return (
    req.headers.get('x-nf-client-connection-ip') ||
    (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    'unknown'
  );
}

function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true; // same-origin requests may omit Origin
  try {
    return new URL(origin).host === req.headers.get('host');
  } catch {
    return false;
  }
}

/* ----------------------------- Semantic cache ----------------------------- */

const CACHE_MAX = 200;              // keep the map small (LRU-ish)
const JACCARD_THRESHOLD = 0.82;     // near-duplicate similarity to reuse an answer

type CacheEntry = {
  answer: string;
  sources: unknown[];
  tokens: Set<string>;
  version: string;
};

// Module-scope cache: survives across requests on a warm instance only.
const answerCache = new Map<string, CacheEntry>();

// Current feed version = hour bucket. Cache entries from older hours are stale
// (the feeds refresh well within an hour) and are dropped on read.
function feedVersion(): number {
  return Math.floor(Date.now() / 3_600_000);
}

// Normalise: lowercase, collapse whitespace, strip surrounding/trailing
// punctuation & question marks so trivially different phrasings collide.
function normaliseQuestion(q: string): string {
  return q
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\s?!.,;:'"()]+$/g, '')
    .trim();
}

function tokenSet(norm: string): Set<string> {
  return new Set(norm.split(/[^a-z0-9]+/).filter(Boolean));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

// Scope must be folded into the cache key/version namespace — otherwise a
// full-access answer could be served back to a region-scoped caller (or one
// region head's cached answer to a different region head) purely because the
// question text matched. Region lists are sorted so scope identity doesn't
// depend on array order.
function scopeKey(scope: Scope): string {
  return scope.full ? 'full' : `r:${[...scope.regions].sort().join('|')}`;
}

// Look up an exact-normalised or near-duplicate cached answer for this version.
// Also lazily evicts entries from previous (expired) versions.
function cacheGet(version: string, key: string, tokens: Set<string>): CacheEntry | null {
  const exact = answerCache.get(key);
  if (exact && exact.version === version) {
    // Refresh recency (LRU-ish).
    answerCache.delete(key);
    answerCache.set(key, exact);
    return exact;
  }

  let best: CacheEntry | null = null;
  let bestSim = 0;
  for (const [k, entry] of answerCache) {
    if (entry.version !== version) {
      answerCache.delete(k); // drop stale (previous-hour) entries
      continue;
    }
    const sim = jaccard(tokens, entry.tokens);
    if (sim > bestSim) { bestSim = sim; best = entry; }
  }
  return bestSim >= JACCARD_THRESHOLD ? best : null;
}

function cacheSet(key: string, entry: CacheEntry): void {
  answerCache.set(key, entry);
  // Evict oldest entries beyond the cap (Map preserves insertion order).
  while (answerCache.size > CACHE_MAX) {
    const oldest = answerCache.keys().next().value;
    if (oldest === undefined) break;
    answerCache.delete(oldest);
  }
}

/* -------------------------------------------------------------------------- */

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  // Auth required — Ask AI must never answer an unauthenticated request, and
  // the region scope is always resolved here server-side from the caller's
  // own session/profile, never from anything the client claims.
  const session = await getSessionProfile();
  if (!session) {
    return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  }
  const scope = scopeFromProfile(session.profile);

  const webhook = process.env.N8N_ASK_WEBHOOK_URL || 'https://olivehospitality.app.n8n.cloud/webhook/ask-ai';

  const ip = clientIp(req);
  if (rateLimited(ip) || userRateLimited(session.userId)) {
    return NextResponse.json({ error: 'Too many questions — please wait a moment.' }, { status: 429 });
  }

  let body: { question?: unknown; context?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const question = typeof body.question === 'string' ? body.question.trim() : '';
  const context = typeof body.context === 'string' ? body.context.slice(0, 2000) : '';
  if (!question) {
    return NextResponse.json({ error: 'Please enter a question.' }, { status: 400 });
  }

  // P1-9 (1) — Relevance guard. Off-topic / gibberish never reaches the LLM
  // (which would otherwise fabricate a confident answer) and never burns model
  // quota. Returns a structured fallback the client renders with suggestion
  // chips. Enforced server-side so it can't be bypassed.
  if (!isRelevantQuery(question)) {
    return NextResponse.json({
      fallback: true,
      suggestions: ASK_SUGGESTIONS,
      message: "I couldn't map that to BD data — try one of these:",
    });
  }

  // Semantic cache — serve repeated / near-duplicate questions for the current
  // feed version straight from memory (0 upstream tokens). Only cache the plain
  // ask (no custom context, which could change the expected answer). The scope
  // is folded into the version namespace so different access scopes never
  // share a cached answer (see scopeKey()).
  const version = `${feedVersion()}::${scopeKey(scope)}`;
  const norm = normaliseQuestion(question);
  const key = `${version}::${norm}`;
  const tokens = tokenSet(norm);
  const cacheable = context.length === 0 && norm.length > 0;

  if (cacheable) {
    const cached = cacheGet(version, key, tokens);
    if (cached) {
      await logAuditEvent(session.supabase, {
        userId: session.userId,
        email: session.email,
        event: 'ask_question',
        detail: {
          question,
          regionScope: scope.full ? 'full' : scope.regions,
          cached: true,
          answerPreview: cached.answer.slice(0, 240),
        },
        ip,
        userAgent: userAgent(req),
      });
      return NextResponse.json({ answer: cached.answer, sources: cached.sources, cached: true });
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 28_000);
  try {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-ask-secret': ASK_SHARED_SECRET },
      body: JSON.stringify({ question: question.slice(0, MAX_QUESTION_LEN), context, scope }),
      signal: controller.signal,
    });
    if (!res.ok) {
      return NextResponse.json({ error: `Assistant is unavailable (${res.status}).` }, { status: 502 });
    }
    const data = await res.json().catch(() => ({}));
    const ans = typeof data?.answer === 'string' ? data.answer.trim() : '';
    if (!ans || ans === 'No answer returned.') {
      // Upstream returned nothing — usually a transient issue or usage cap.
      return NextResponse.json(
        { error: "The AI assistant is momentarily unavailable — please try again in a bit." },
        { status: 503 }
      );
    }
    const sources = Array.isArray(data?.sources) ? data.sources : [];

    // Store the fresh answer under the normalised key for this feed version
    // (already scope-namespaced above).
    if (cacheable) {
      cacheSet(key, { answer: ans, sources, tokens, version });
    }

    await logAuditEvent(session.supabase, {
      userId: session.userId,
      email: session.email,
      event: 'ask_question',
      detail: {
        question,
        regionScope: scope.full ? 'full' : scope.regions,
        cached: false,
        answerPreview: ans.slice(0, 240),
      },
      ip,
      userAgent: userAgent(req),
    });

    return NextResponse.json({ answer: ans, sources });
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError';
    return NextResponse.json(
      { error: aborted ? 'The assistant took too long — please try again.' : 'Could not reach the assistant.' },
      { status: 504 }
    );
  } finally {
    clearTimeout(timeout);
  }
}
