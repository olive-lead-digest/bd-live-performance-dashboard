'use client';

import { useEffect, useRef, useState } from 'react';
import { Link2, Copy, Check, Ban, RefreshCw, Pencil, X, Eye } from 'lucide-react';
import { normalizeShareSlug, validateShareSlug, SHARE_SLUG_MAX } from '@/lib/shareSlug';

export type ShareLinkRow = {
  id: string;
  slug: string | null;
  /** What the admin copies and sends — the slug URL when a slug is set. */
  url: string;
  /** The original random URL. Still live, for links already sent out. */
  tokenUrl: string;
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

/** Everything before the last path segment, e.g. ".../share/". */
function urlPrefix(url: string): string {
  const i = url.lastIndexOf('/');
  return i === -1 ? url : url.slice(0, i + 1);
}

/**
 * Admin tool: the ONE public "anyone with the link" share link.
 *
 * Anyone who opens the URL sees the whole dashboard (all regions, all brands,
 * Ask AI) with no login and no password — that is the point of it. It never
 * unlocks this page or anything else under /admin. Revoking takes effect on
 * the very next request anyone makes with it.
 *
 * The link has two halves and the difference matters, so the UI says it out
 * loud rather than hiding it:
 *   - the SHORT NAME (the slug) is the public, memorable, GUESSABLE part that
 *     actually gets sent to people;
 *   - the long random address underneath it never stops working, so nothing
 *     already sent out breaks when the short name changes.
 */
export function ShareLinkPanel({ initial }: { initial: ShareLinkRow | null }) {
  const [link, setLink] = useState<ShareLinkRow | null>(initial);
  const [busy, setBusy] = useState<null | 'create' | 'revoke' | 'set-slug'>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<null | 'slug' | 'token'>(null);
  const [confirming, setConfirming] = useState(false);
  const [showToken, setShowToken] = useState(false);

  // --- inline slug editor -------------------------------------------------
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initial?.slug ?? '');
  const [saveError, setSaveError] = useState<string | null>(null);
  /** Last answer from the server's availability check, tagged with the exact
   *  slug it was asked about so a stale reply can never be shown. */
  const [remote, setRemote] = useState<{ slug: string; available: boolean; error: string | null } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Everything below is DERIVED from the draft, not stored: format, length
  // and reserved words are answered instantly and offline by the same pure
  // module the API route uses, so there is no state to fall out of sync.
  const normalized = normalizeShareSlug(draft);
  const local = validateShareSlug(draft);
  const unchanged = !!link?.slug && !!normalized && normalized === link.slug;
  const remoteForDraft = remote && remote.slug === normalized ? remote : null;
  const checking = !!draft.trim() && local.ok && !unchanged && !remoteForDraft;

  const slugError =
    saveError ??
    (!draft.trim()
      ? null
      : !local.ok
        ? local.error
        : remoteForDraft && !remoteForDraft.available
          ? remoteForDraft.error || 'That name is already taken — please pick another.'
          : null);
  const slugOk = !slugError && remoteForDraft?.available ? `${normalized} is available` : null;

  // Uniqueness is the one rule only the database can answer, so it is asked
  // for on a short debounce. Every setState here happens inside the async
  // callback, never synchronously in the effect body.
  useEffect(() => {
    if (!editing) return;
    const check = validateShareSlug(draft);
    if (!check.ok) return;
    if (link?.slug && check.slug === link.slug) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await fetch('/api/admin/share-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'check-slug', slug: check.slug }),
        });
        const b = await res.json().catch(() => ({}));
        if (cancelled) return;
        setRemote({ slug: check.slug, available: !!b?.available, error: b?.error ?? null });
      } catch {
        /* offline: Save is still authoritative, the server re-validates */
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [draft, editing, link?.slug]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const call = async (action: 'create' | 'revoke') => {
    setBusy(action);
    setError(null);
    setCopied(null);
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
        setDraft(body.link?.slug ?? '');
        setRemote(null);
        setSaveError(null);
        setConfirming(false);
        setEditing(false);
        setShowToken(false);
      }
    } catch {
      setError('Could not reach the server.');
    }
    setBusy(null);
  };

  const saveSlug = async () => {
    const check = validateShareSlug(draft);
    if (!check.ok) {
      setSaveError(check.error);
      return;
    }
    setBusy('set-slug');
    setError(null);
    setSaveError(null);
    try {
      const res = await fetch('/api/admin/share-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set-slug', slug: check.slug }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        // The server (and behind it the CHECK constraint + unique index) is
        // the authority; the live hints above are only a convenience.
        setSaveError(body?.error || 'Could not save that name.');
      } else {
        setLink(body.link ?? null);
        setDraft(body.link?.slug ?? '');
        setRemote(null);
        setEditing(false);
        setCopied(null);
      }
    } catch {
      setSaveError('Could not reach the server.');
    }
    setBusy(null);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft(link?.slug ?? '');
    setSaveError(null);
    setRemote(null);
  };

  const copy = async (which: 'slug' | 'token') => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(which === 'slug' ? link.url : link.tokenUrl);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* clipboard unavailable — the URL is selectable above */
    }
  };

  const canSave = !!draft.trim() && !slugError && !checking && !unchanged && busy === null;

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
              onClick={() => copy('slug')}
              className="shrink-0 rounded-lg border border-border-subtle px-3 py-2 text-sm text-text-secondary hover:text-white transition-colors flex items-center gap-1.5"
            >
              {copied === 'slug' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied === 'slug' ? 'Copied' : 'Copy'}
            </button>
          </div>

          {/* ---- the short name: public, memorable, and guessable ---- */}
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 flex flex-col gap-2">
            {editing ? (
              <>
                <label htmlFor="share-slug" className="text-[11px] font-semibold uppercase tracking-wider text-amber-200/90">
                  Short name for the link
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-text-secondary font-mono">{urlPrefix(link.url)}</span>
                  <input
                    id="share-slug"
                    ref={inputRef}
                    value={draft}
                    maxLength={SHARE_SLUG_MAX}
                    spellCheck={false}
                    autoComplete="off"
                    placeholder="olive-bd"
                    onChange={(e) => {
                      setDraft(e.target.value);
                      setSaveError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && canSave) saveSlug();
                      if (e.key === 'Escape') cancelEdit();
                    }}
                    aria-invalid={!!slugError}
                    aria-describedby="share-slug-msg"
                    className={`w-48 rounded-lg bg-black/40 border px-3 py-1.5 text-xs font-mono text-white outline-none transition-colors ${
                      slugError ? 'border-red-500/60' : 'border-border-subtle focus:border-brand-pink-500/60'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={saveSlug}
                    disabled={!canSave}
                    className="rounded-lg bg-brand-pink-500/20 border border-brand-pink-500/40 text-brand-pink-400 text-sm font-semibold px-4 py-1.5 hover:bg-brand-pink-500/30 transition-colors disabled:opacity-40"
                  >
                    {busy === 'set-slug' ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="text-sm text-text-secondary hover:text-white flex items-center gap-1"
                  >
                    <X className="w-3.5 h-3.5" />
                    Cancel
                  </button>
                </div>
                <p id="share-slug-msg" role={slugError ? 'alert' : undefined} className="text-[11px] leading-relaxed">
                  {slugError ? (
                    <span className="text-red-300">{slugError}</span>
                  ) : checking ? (
                    <span className="text-text-secondary">Checking…</span>
                  ) : slugOk ? (
                    <span className="text-emerald-300">{slugOk}</span>
                  ) : (
                    <span className="text-text-secondary">
                      4–32 characters: lowercase letters, numbers and hyphens. No spaces, and it can&apos;t start or end
                      with a hyphen.
                    </span>
                  )}
                </p>
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-200/90">
                    Short name
                  </span>
                  <code className="text-xs font-mono text-white bg-black/40 rounded px-2 py-0.5">
                    {link.slug ?? 'not set'}
                  </code>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(true);
                      setDraft(link.slug ?? '');
                      setSaveError(null);
                      setRemote(null);
                    }}
                    disabled={busy !== null}
                    className="rounded-lg border border-border-subtle px-2.5 py-1 text-xs text-text-secondary hover:text-white transition-colors flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Pencil className="w-3 h-3" />
                    {link.slug ? 'Change' : 'Set a short name'}
                  </button>
                </div>
                <p className="text-[11px] text-amber-100/70 leading-relaxed">
                  This short name is the <strong className="text-amber-100">public, guessable</strong> part of the URL —
                  it is meant to be easy to type and read out, which also means someone could stumble on it. That is a
                  deliberate trade. Nothing else changed: the link is still logged on every visit, still revocable in one
                  click, still blocked from every admin page, and search engines are told not to index it. If you ever
                  need it to be unguessable again, hide the short name and send the long address below instead.
                </p>
              </>
            )}
          </div>

          {/* ---- the original long random address, never retired ---- */}
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => setShowToken((v) => !v)}
              className="self-start text-[11px] text-text-secondary hover:text-white underline flex items-center gap-1.5"
            >
              <Eye className="w-3 h-3" />
              {showToken ? 'Hide' : 'Show'} the long unguessable address (still works)
            </button>
            {showToken && (
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={link.tokenUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label="Long random share link"
                  className="flex-1 min-w-0 rounded-lg bg-black/30 border border-border-subtle px-3 py-2 text-xs text-text-secondary outline-none"
                />
                <button
                  type="button"
                  onClick={() => copy('token')}
                  className="shrink-0 rounded-lg border border-border-subtle px-3 py-2 text-sm text-text-secondary hover:text-white transition-colors flex items-center gap-1.5"
                >
                  {copied === 'token' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  {copied === 'token' ? 'Copied' : 'Copy'}
                </button>
              </div>
            )}
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
                <span className="text-[11px] text-text-secondary">
                  Generating a new one replaces the long address but keeps the short name, so{' '}
                  <code className="text-brand-purple-200">{link.slug ?? 'it'}</code> keeps working.
                </span>
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
