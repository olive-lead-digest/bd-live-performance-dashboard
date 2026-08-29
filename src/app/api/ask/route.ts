import { NextRequest, NextResponse } from 'next/server';
import { isRelevantQuery, ASK_SUGGESTIONS } from '@/lib/askGuard';
import { getSessionProfile, scopeFromProfile, hasSetPassword, type Scope } from '@/lib/auth';
import { logAuditEvent, userAgent } from '@/lib/audit';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SHARE_COOKIE, logShareEvent, resolveShareToken } from '@/lib/share';

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
 * Password-set gate: a valid session alone does not mean the user ever
 * actually saved a real password (see src/lib/auth.ts / src/proxy.ts). The
 * proxy already blocks this in normal operation — this is the same
 * independent second check as the region scoping above, not the only one.
 *
 * Cost control: a lightweight in-memory semantic cache. Repeated or near-duplicate
 * questions (same hourly feed version) are served from memory WITHOUT calling n8n
 * or the model — 0 upstream tokens. The cache is per warm serverless instance
 * (module scope), so no new infra; it self-expires when the hour bucket changes.
 * The cache key is scoped by the caller's access scope (full vs. the exact
 * region set) so a full-access answer can never be served to a region-scoped
 * caller, or one region's cached answer to a different region's head.
 *
 * Share link: a visitor on a live public share link is the ONE unauthenticated
 * caller this route answers, deliberately. They ask at scope {full:true} — the
 * same scope a `leadership` user gets — and every question is audited as
 * email='shared-link' with detail.via='share'.
 *
 * Share-link questions are deliberately NOT rate limited: a share visitor gets
 * the same uncapped Ask AI a signed-in leadership user gets. Spend is contained
 * by the semantic cache below and, if a link is ever abused, by revoking it in
 * the admin panel — revocation is instant.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Vercel kills the function at the platform default (10s on Hobby) unless
// maxDuration is raised, which would abort the request before our own
// AbortController ever fires. 60 is also the CEILING this account can set:
// the team is on the Hobby plan, where 60s is the maximum permitted
// maxDuration. There is no headroom to buy by raising this number — the only
// way past 60s would be a plan upgrade.
//
// That ceiling is why the Ask AI model node runs Claude Fable 5 at `high`
// effort rather than `max`. Measured Aug 2026 on six real questions:
//   high -> 20.3s / 23.2s / 26.4s / 28.0s / 32.0s / 33.1s  (6 of 6 inside 55s)
//   max  -> 38.9s / 67.8s / 68.7s / 100.7s / 118.3s / >125s (1 of 6 inside 55s)
// Max effort also blew past the ~120s edge timeout in front of n8n Cloud on
// the hardest question, which returns an HTML error page rather than JSON.
// The n8n model node gives up at 50s so an outlier returns the assistant's
// own graceful message plus the code-computed table, not a bare 504.
export const maxDuration = 60;

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

// Window signature — a coarse label for any explicit time window named in the
// question ("last 2 months", "this quarter", "since June", ...). Folded into the
// cache version namespace so two DIFFERENT windows can never collide on the
// near-duplicate (Jaccard) path — "last 2 months" and "last 6 months" differ by
// a single token and would otherwise be treated as the same question. Mirrors
// the deterministic window parser in the n8n Merge Feeds node closely enough to
// separate the buckets; the authoritative slicing still happens server-side.
function windowSignature(q: string): string {
  const s = " " + q.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim() + " ";
  const NUM: Record<string, number> = { one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10, eleven:11, twelve:12, couple:2, few:3, several:3, a:1, an:1 };
  const num = (w: string): number | null => (/^\d+$/.test(w) ? parseInt(w, 10) : (NUM[w] ?? null));
  const WORDS = "\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|a|an|couple|few|several";
  let m: RegExpMatchArray | null;
  if ((m = s.match(new RegExp("\\b(?:last|past|previous|recent|trailing)\\s+(" + WORDS + ")\\s+weeks?\\b")))) return "w:" + (num(m[1]) || 1) + "wk";
  if (/\bthis week\b|\bweek to date\b|\bwtd\b/.test(s)) return "w:thiswk";
  if (/\blast week\b|\bpast week\b|\bprevious week\b/.test(s)) return "w:lastwk";
  if ((m = s.match(new RegExp("\\b(?:last|past|previous|recent|trailing)\\s+(" + WORDS + ")\\s+days?\\b")))) return "w:" + (num(m[1]) || 1) + "d";
  if (/\bmtd\b|\bmonth to date\b|\bthis month so far\b|\bso far this month\b/.test(s) || (/\bthis month\b|\bcurrent month\b/.test(s) && !/\blast month\b|\bprevious month\b|\bprior month\b/.test(s))) return "w:thismonth";
  if (/\bthis month\b.*\blast month\b|\blast month\b.*\bthis month\b|\bmonth\s*(?:over|on)\s*month\b|\bmonth[-\s]?on[-\s]?month\b/.test(s)) return "w:mom";
  if (/\blast month\b|\bprevious month\b|\bprior month\b/.test(s)) return "w:lastmonth";
  if ((m = s.match(new RegExp("\\b(?:last|past|previous|recent|trailing|most recent)\\s+(" + WORDS + ")\\s+(?:of\\s+)?months?\\b")))) return "w:" + (num(m[1]) || 2) + "m";
  if (/\bthis quarter\b|\bcurrent quarter\b|\bqtd\b|\bquarter to date\b/.test(s)) return "w:thisq";
  if (/\blast quarter\b|\bprevious quarter\b|\bprior quarter\b/.test(s)) return "w:lastq";
  if (/\bytd\b|\byear to date\b|\bthis (?:fiscal|financial) year\b|\bthis fy\b|\bthis year\b/.test(s)) return "w:ytd";
  if ((m = s.match(/\bsince\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s*(\d{4})?\b/))) return "w:since-" + m[1].slice(0, 3) + (m[2] || "");
  if ((m = s.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/))) return "w:mon-" + m[1].slice(0, 3);
  return "w:none";
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

/* --------------------------- Who is asking? ------------------------------ */

type Actor =
  | { kind: 'user'; userId: string; email: string; supabase: SupabaseClient; scope: Scope }
  | { kind: 'share'; token: string; scope: Scope };

/** One audit write, routed to the right path for the caller's kind. */
async function logAsk(
  actor: Actor,
  detail: Record<string, unknown>,
  ip: string,
  ua: string
): Promise<void> {
  if (actor.kind === 'user') {
    await logAuditEvent(actor.supabase, {
      userId: actor.userId,
      email: actor.email,
      event: 'ask_question',
      detail,
      ip,
      userAgent: ua,
    });
  } else {
    await logShareEvent(actor.token, 'ask_question', detail, ip, ua);
  }
}

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  // Auth required — Ask AI must never answer an unauthenticated request UNLESS
  // it arrives on a live public share link. The scope is always resolved here
  // server-side (from the caller's own session/profile, or full for a share
  // visitor), never from anything the client claims.
  const session = await getSessionProfile();
  const ip = clientIp(req);
  const ua = userAgent(req);

  let actor: Actor;
  if (session) {
    if (!hasSetPassword(session.profile)) {
      return NextResponse.json(
        { error: 'You need to set a password before continuing. Please finish the reset-password step.' },
        { status: 401 }
      );
    }
    actor = {
      kind: 'user',
      userId: session.userId,
      email: session.email,
      supabase: session.supabase,
      scope: scopeFromProfile(session.profile),
    };
    if (rateLimited(ip) || userRateLimited(session.userId)) {
      return NextResponse.json({ error: 'Too many questions — please wait a moment.' }, { status: 429 });
    }
  } else {
    const share = await resolveShareToken(req.cookies.get(SHARE_COOKIE)?.value);
    if (!share) {
      return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
    }
    // No rate limit here by design: a share visitor asks freely, exactly like a
    // signed-in leadership user. Containment is revocation, not throttling.
    actor = { kind: 'share', token: share.token, scope: { full: true } };
  }

  const scope = actor.scope;
  const webhook = process.env.N8N_ASK_WEBHOOK_URL || 'https://olivehospitality.app.n8n.cloud/webhook/ask-ai';

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
  // The window signature is part of the version namespace so a change of time
  // window in the question always lands in a different cache bucket (and can
  // never be served a different window's near-duplicate answer).
  const version = `${feedVersion()}::${scopeKey(scope)}::${windowSignature(question)}`;
  const norm = normaliseQuestion(question);
  const key = `${version}::${norm}`;
  const tokens = tokenSet(norm);
  const cacheable = context.length === 0 && norm.length > 0;

  if (cacheable) {
    const cached = cacheGet(version, key, tokens);
    if (cached) {
      await logAsk(
        actor,
        {
          question,
          regionScope: scope.full ? 'full' : scope.regions,
          cached: true,
          answerPreview: cached.answer.slice(0, 240),
        },
        ip,
        ua
      );
      return NextResponse.json({ answer: cached.answer, sources: cached.sources, cached: true });
    }
  }

  const controller = new AbortController();
  // 55s: comfortably inside maxDuration (60s) so we always return our own
  // friendly message rather than a platform-level 504 with no body.
  const timeout = setTimeout(() => controller.abort(), 55_000);
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

    await logAsk(
      actor,
      {
        question,
        regionScope: scope.full ? 'full' : scope.regions,
        cached: false,
        answerPreview: ans.slice(0, 240),
      },
      ip,
      ua
    );

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
