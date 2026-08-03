import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Renamed to /api/audit (the client beacons now post there). A stale open tab
 * hitting this old path gets a harmless 410; its beacon is dropped. (File
 * kept only because the build environment cannot delete files.)
 */
export async function POST() {
  return NextResponse.json({ ok: false, error: 'Moved to /api/audit.' }, { status: 410 });
}
