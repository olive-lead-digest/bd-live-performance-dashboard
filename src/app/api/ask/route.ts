import { NextRequest, NextResponse } from 'next/server';
import { isRelevantQuery, ASK_SUGGESTIONS } from '@/lib/askGuard';

/*
 * Ask-AI proxy. The browser posts { question, context } here; this server-side
 * function forwards it to the n8n webhook (URL kept in N8N_ASK_WEBHOOK_URL, never
 * exposed to the client) and returns n8n's { answer, sources }.
 *
 * Protections: rejects empty questions, same-origin only, best-effort per-IP rate
 * limit. No secrets in the client bundle.
 *
 * Cost control: a lightweight in-memory semantic cache. Repeated or near-duplicate
 * questions (same hourly feed version) are served from memory WITHOUT calling n8n
 * or the model — 0 upstream tokens. The cache is per warm serverless instance
 * (module scope), so no new infra; it self-expires when the hour bucket changes.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 8; // a few questions/min per IP
const MAX_QUESTION_LEN = 600;

// Best-effort in-memory limiter (per warm serverless instance).
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter(t => now - t < WINDOW_MS);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear(); // guard against unbounded growth
  return arr.length > MAX_PER_WINDOW;
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
  version: number;
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

// Look up an exact-normalised or near-duplicate cached answer for this version.
// Also lazily evicts entries from previous (expired) versions.
function cacheGet(version: number, key: string, tokens: Set<string>): CacheEntry | null {
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

  const webhook = process.env.N8N_ASK_WEBHOOK_URL || 'https://olivehospitality.app.n8n.cloud/webhook/ask-ai';

  const ip = clientIp(req);
  if (rateLimited(ip)) {
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
  // ask (no custom context, which could change the expected answer).
  const version = feedVersion();
  const norm = normaliseQuestion(question);
  const key = `${version}::${norm}`;
  const tokens = tokenSet(norm);
  const cacheable = context.length === 0 && norm.length > 0;

  if (cacheable) {
    const cached = cacheGet(version, key, tokens);
    if (cached) {
      return NextResponse.json({ answer: cached.answer, sources: cached.sources, cached: true });
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 28_000);
  try {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: question.slice(0, MAX_QUESTION_LEN), context }),
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

    // Store the fresh answer under the normalised key for this feed version.
    if (cacheable) {
      cacheSet(key, { answer: ans, sources, tokens, version });
    }

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
