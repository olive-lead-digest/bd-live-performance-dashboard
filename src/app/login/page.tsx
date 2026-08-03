'use client';

import { useEffect, useState } from 'react';

export default function LoginPage() {
  const [mode, setMode] = useState<'signin' | 'forgot'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Expired/invalid link redirects land here with ?error=link (read via
  // window.location, not useSearchParams, so no Suspense boundary is needed —
  // same convention as the filter state elsewhere in this app).
  useEffect(() => {
    try {
      if (new URLSearchParams(window.location.search).get('error') === 'link') {
        setError('That link is invalid or has expired. Use “Forgot password” below, or ask Harshit Sharma for a fresh setup link.');
        window.history.replaceState(window.history.state, '', '/login');
      }
    } catch {
      /* ignore */
    }
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error || 'Could not sign in.');
        setLoading(false);
        return;
      }
      // Full navigation (not client-side router) so the proxy re-evaluates
      // the fresh session cookie and the whole app tree mounts signed-in.
      window.location.href = '/';
    } catch {
      setError('Could not reach the server. Please try again.');
      setLoading(false);
    }
  };

  const onForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/auth/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error || 'Could not send the reset email.');
      } else {
        setNotice(
          'If that address has dashboard access, a reset email is on its way. Nothing arriving? Ask Harshit Sharma to issue a fresh setup link.'
        );
      }
    } catch {
      setError('Could not reach the server. Please try again.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background text-foreground px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="text-lg font-black text-white tracking-wide">Olive Hospitality</div>
          <h1 className="text-sm font-semibold text-text-secondary mt-1">BD Performance Dashboard</h1>
        </div>

        {mode === 'signin' ? (
          <form
            onSubmit={onSubmit}
            className="glass-panel rounded-2xl p-6 sm:p-8 border border-border-subtle flex flex-col gap-4"
          >
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg bg-black/30 border border-border-subtle px-3.5 py-2.5 text-white placeholder:text-text-secondary outline-none focus:border-brand-pink-500/60 transition-colors"
                placeholder="you@oliveliving.com"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg bg-black/30 border border-border-subtle px-3.5 py-2.5 text-white placeholder:text-text-secondary outline-none focus:border-brand-pink-500/60 transition-colors"
                placeholder="••••••••••"
              />
            </div>

            {error && (
              <p role="alert" className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="mt-2 w-full rounded-lg bg-brand-pink-500 hover:bg-brand-pink-400 disabled:opacity-50 text-white font-bold py-2.5 transition-colors"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>

            <button
              type="button"
              onClick={() => {
                setMode('forgot');
                setError(null);
                setNotice(null);
              }}
              className="text-xs font-medium text-text-secondary hover:text-white transition-colors self-center"
            >
              Forgot password?
            </button>
          </form>
        ) : (
          <form
            onSubmit={onForgot}
            className="glass-panel rounded-2xl p-6 sm:p-8 border border-border-subtle flex flex-col gap-4"
          >
            <div>
              <h2 className="text-sm font-bold text-white">Reset your password</h2>
              <p className="text-xs text-text-secondary mt-1">
                Enter your work email — if it has dashboard access, you&rsquo;ll get a link to set a new password.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="femail" className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                Email
              </label>
              <input
                id="femail"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg bg-black/30 border border-border-subtle px-3.5 py-2.5 text-white placeholder:text-text-secondary outline-none focus:border-brand-pink-500/60 transition-colors"
                placeholder="you@oliveliving.com"
              />
            </div>

            {error && (
              <p role="alert" className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
            {notice && (
              <p role="status" className="text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2">
                {notice}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !email}
              className="mt-2 w-full rounded-lg bg-brand-pink-500 hover:bg-brand-pink-400 disabled:opacity-50 text-white font-bold py-2.5 transition-colors"
            >
              {loading ? 'Sending…' : 'Send reset link'}
            </button>

            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setError(null);
                setNotice(null);
              }}
              className="text-xs font-medium text-text-secondary hover:text-white transition-colors self-center"
            >
              Back to sign in
            </button>
          </form>
        )}

        <p className="text-center text-[11px] text-text-secondary mt-6">
          Internal tool — access is limited to authorised Olive Hospitality BD staff.
        </p>
      </div>
    </div>
  );
}
