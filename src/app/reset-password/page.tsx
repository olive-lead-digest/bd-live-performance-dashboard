'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Set-a-new-password page. Reached from:
 *   - a one-time setup / admin reset link (via /auth/confirm, which already
 *     established a session in httpOnly cookies), or
 *   - a Supabase "forgot password" email (either the PKCE ?code= path through
 *     /auth/confirm, or an implicit-flow link carrying tokens in the URL hash,
 *     which this page converts into a cookie session client-side).
 * Fails closed: if no session exists, saving returns 401 with guidance.
 */
export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Implicit-flow links land with #access_token=…&refresh_token=… — convert
  // them into a cookie session so the server routes can see it.
  useEffect(() => {
    try {
      const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
      if (!hash) return;
      const params = new URLSearchParams(hash);
      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');
      if (access_token && refresh_token) {
        const supabase = createClient();
        supabase.auth
          .setSession({ access_token, refresh_token })
          .catch(() => {})
          .finally(() => {
            // Scrub the tokens from the address bar either way.
            window.history.replaceState(window.history.state, '', window.location.pathname);
          });
      }
    } catch {
      /* never break the page over hash parsing */
    }
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 12) {
      setError('Choose a password with at least 12 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error || 'Could not set the password.');
        setLoading(false);
        return;
      }
      // Full navigation so the proxy re-evaluates the session and the whole
      // app tree mounts signed-in.
      window.location.href = '/';
    } catch {
      setError('Could not reach the server. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background text-foreground px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="text-lg font-black text-white tracking-wide">Olive Hospitality</div>
          <h1 className="text-base font-bold text-white mt-3">Set your password</h1>
          <p className="text-sm text-text-secondary mt-1">
            Choose the password you&rsquo;ll use to sign in to the BD dashboard.
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="glass-panel rounded-2xl p-6 sm:p-8 border border-border-subtle flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
              New password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg bg-black/30 border border-border-subtle px-3.5 py-2.5 text-white placeholder:text-text-secondary outline-none focus:border-brand-pink-500/60 transition-colors"
              placeholder="At least 12 characters"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="confirm" className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
              Confirm password
            </label>
            <input
              id="confirm"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-lg bg-black/30 border border-border-subtle px-3.5 py-2.5 text-white placeholder:text-text-secondary outline-none focus:border-brand-pink-500/60 transition-colors"
              placeholder="Re-enter the password"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !password || !confirm}
            className="mt-2 w-full rounded-lg bg-brand-pink-500 hover:bg-brand-pink-400 disabled:opacity-50 text-white font-bold py-2.5 transition-colors"
          >
            {loading ? 'Saving…' : 'Save and continue'}
          </button>
        </form>

        <p className="text-center text-[11px] text-text-secondary mt-6">
          Link expired? Use &ldquo;Forgot password&rdquo; on the sign-in page, or ask Harshit Sharma for a fresh setup link.
        </p>
      </div>
    </div>
  );
}
