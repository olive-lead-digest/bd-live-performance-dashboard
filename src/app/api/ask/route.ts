import { NextRequest, NextResponse } from 'next/server';
import { isRelevantQuery, ASK_SUGGESTIONS } from '@/lib/askGuard';

/*
 * Ask-AI proxy. The browser posts { question, context } here; this server-side
 * function forwards it to the n8n webhook (URL kept in N8N_ASK_WEBHOOK_URL, never
 * exposed to the client) and returns n8n's { answer, sources }.
 *
 * Protections: rejects empty questions, same-origin only, best-effort per-IP rate
 * limit. No secrets in the client bundle.
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
  // (which would otherwise fabricate a confident answer) and never burns Gemini
  // free-tier quota. Returns a structured fallback the client renders with
  // suggestion chips. Enforced server-side so it can't be bypassed.
  if (!isRelevantQuery(question)) {
    return NextResponse.json({
      fallback: true,
      suggestions: ASK_SUGGESTIONS,
      message: "I couldn't map that to BD data — try one of these:",
    });
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
      // Upstream (Gemini free tier) returned nothing — almost always the daily usage cap.
      return NextResponse.json(
        { error: "The AI assistant has reached today's free usage limit. It resets daily — please try again later." },
        { status: 503 }
      );
    }
    return NextResponse.json({
      answer: ans,
      sources: Array.isArray(data?.sources) ? data.sources : [],
    });
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
