import { cookies } from 'next/headers';
import { SHARE_COOKIE, resolveShareToken, type ShareContext } from './share';

/**
 * Server-Component-side read of the share cookie (layout.tsx uses it to decide
 * whether to render the "shared view" chrome). Kept in its own module because
 * next/headers is not available in the Edge proxy, which imports ./share.
 *
 * A real signed-in session ALWAYS takes precedence over this — callers check
 * getSessionProfile() first.
 */
export async function getShareContext(): Promise<ShareContext | null> {
  try {
    const store = await cookies();
    return await resolveShareToken(store.get(SHARE_COOKIE)?.value);
  } catch {
    return null;
  }
}
