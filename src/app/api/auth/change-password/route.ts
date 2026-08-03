import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Replaced by /api/auth/set-password (the forced first-login password flow
 * became one-time setup links + /reset-password). A stale client hitting this
 * old path gets a clear pointer. (File kept only because the build
 * environment cannot delete files.)
 */
export async function POST() {
  return NextResponse.json({ error: 'Moved — use /api/auth/set-password.' }, { status: 410 });
}
