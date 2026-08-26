'use client';

import { useState } from 'react';
import { Link2, Copy, Check, Ban, RefreshCw } from 'lucide-react';

export type ShareLinkRow = {
  id: string;
  url: string;
  label: string;
  created_at: string;
  hits: number;
  last_seen_at: string | null;
};

function fmt(ts: string | null): string {
  if (!ts) return 'never';
  return `${new Date(ts).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  })} IST`;
}

/**
 * Admin tool: the ONE public "anyone with the link" share link.
 *
 * Anyone who opens the URL sees the whole dashboard (all regions, all brands,
 * Ask AI) with no login and no password — that is the point of it. It never
 * unlocks this page or anything else under /admin. Revoking takes effect on
 * the very next request anyone makes with it.
 */
export function ShareLinkPanel({ initial }: { initial: ShareLinkRow | null }) {
  const [link, setLink] = useState<ShareLinkRow | null>(initial);
  const [busy, setBusy] = useState<null | 'create' | 'revoke'>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const call = async (action: 'create' | 'revoke') => {
    setBusy(action);
    setError(null);
    setCopied(false);
    try {
      const res = await fetch('/api/admin/share-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error || 'That did not work.');
      } else {
        setLink(body.link ?? null);
        setConfirming(false);
      }
    } catch {
      setError('Could not reach the server.');
    }
    setBusy(null);
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — the URL is selectable below */
    }
  };

  return (
    <div className="glass-panel p-4 sm:p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Link2 className="w-4 h-4 text-brand-pink-400" />
        <h2 className="text-sm font-bold text-white">Public share link — anyone with the link</h2>
      </div>
      <p className="text-xs text-text-secondary">
        One URL that opens the full dashboard — every region and brand, plus Ask AI — with{' '}
        <strong className="text-white font-semibold">no login and no password</strong>. Treat it like the data itself:
        anyone it reaches, and anyone they forward it to, can read everything. It never gives access to this Activity
        Log or any other admin tool. Every visit, page view and question is logged below as{' '}
        <code className="text-brand-purple-200">shared-link</code>. Revoking kills it instantly.
      </p>

      {error && (
        <p role="alert" className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {link ? (
        <>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={link.url}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="Public share link"
              className="flex-1 min-w-0 rounded-lg bg-black/30 border border-emerald-500/40 px-3 py-2 text-xs text-emerald-200 outline-none"
            />
            <button
              type="button"
              onClick={copy}
              className="shrink-0 rounded-lg border border-border-subtle px-3 py-2 text-sm text-text-secondary hover:text-white transition-colors flex items-center gap-1.5"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="text-[11px] text-text-secondary">
            Active since {fmt(link.created_at)} · {link.hits.toLocaleString('en-IN')} open
            {link.hits === 1 ? '' : 's'} · last opened {fmt(link.last_seen_at)}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {confirming ? (
              <>
                <span className="text-xs text-red-300">Revoke it? Anyone using it loses access immediately.</span>
                <button
                  type="button"
                  onClick={() => call('revoke')}
                  disabled={busy !== null}
                  className="rounded-lg bg-red-500/20 border border-red-500/40 text-red-300 text-sm font-semibold px-4 py-2 hover:bg-red-500/30 transition-colors disabled:opacity-50"
                >
                  {busy === 'revoke' ? 'Revoking…' : 'Yes, revoke'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="text-sm text-text-secondary hover:text-white underline"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  disabled={busy !== null}
                  className="rounded-lg border border-red-500/40 text-red-300 text-sm font-semibold px-4 py-2 hover:bg-red-500/20 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Ban className="w-3.5 h-3.5" />
                  Revoke link
                </button>
                <button
                  type="button"
                  onClick={() => call('create')}
                  disabled={busy !== null}
                  className="rounded-lg border border-border-subtle text-text-secondary text-sm font-semibold px-4 py-2 hover:text-white transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  {busy === 'create' ? 'Generating…' : 'Generate a new one'}
                </button>
              </>
            )}
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-text-secondary">No share link is active right now.</span>
          <button
            type="button"
            onClick={() => call('create')}
            disabled={busy !== null}
            className="rounded-lg bg-brand-pink-500/20 border border-brand-pink-500/40 text-brand-pink-400 text-sm font-semibold px-4 py-2 hover:bg-brand-pink-500/30 transition-colors disabled:opacity-50"
          >
            {busy === 'create' ? 'Generating…' : 'Generate share link'}
          </button>
        </div>
      )}
    </div>
  );
}
