import { redirect } from 'next/navigation';
import { getSessionProfile } from '@/lib/auth';
import { ResetLinkPanel } from './ResetLinkPanel';
import { ShareLinkPanel, type ShareLinkRow } from './ShareLinkPanel';
import { shareUrl } from '@/lib/share';

export const dynamic = 'force-dynamic';

const EVENT_TYPES = [
  'login_success',
  'login_failed',
  'logout',
  'page_view',
  'ask_question',
  'report_export',
  'feed_access',
  'password_set',
  'reset_link_issued',
  'share_visit',
  'share_rate_limited',
];
const PAGE_SIZE = 50;

// Always display in IST — the audience for this page sits in India, the
// server does not.
function fmt(ts: string) {
  return `${new Date(ts).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'Asia/Kolkata',
  })} IST`;
}

function detailPreview(detail: unknown): string {
  if (!detail || typeof detail !== 'object') return '';
  const d = detail as Record<string, unknown>;
  if (typeof d.question === 'string') {
    return `Q: ${d.question}${d.answerPreview ? ` — A: ${String(d.answerPreview).slice(0, 140)}` : ''}`;
  }
  if (typeof d.path === 'string') return `Path: ${d.path}${d.query ? String(d.query) : ''}`;
  if (typeof d.reportType === 'string') return `Export: ${d.reportType}`;
  if (typeof d.for === 'string') return `Reset link for: ${d.for}`;
  if (typeof d.label === 'string' && d.via === 'share') return `Shared link opened: ${d.label}`;
  if (typeof d.reason === 'string' && (d.reason === 'ip' || d.reason === 'global')) {
    return `Share Ask AI limit hit (${d.reason === 'ip' ? 'per-IP hourly' : 'global daily'})`;
  }
  if (typeof d.route === 'string') {
    const scope = Array.isArray(d.scope) ? d.scope.join(', ') : d.scope === 'full' ? 'all regions' : '';
    return `Feed: ${d.route}${scope ? ` (${scope})` : ''}`;
  }
  if (typeof d.reason === 'string') return `Reason: ${d.reason}`;
  try {
    return JSON.stringify(d).slice(0, 200);
  } catch {
    return '';
  }
}

type AuditRow = {
  id: number;
  ts: string;
  email: string | null;
  event: string;
  detail: unknown;
  ip: string | null;
};

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string; eventType?: string; page?: string }>;
}) {
  const session = await getSessionProfile();
  if (!session) redirect('/login');
  // Server-enforced gate — this is the actual access control, not just a
  // hidden nav link. Anyone who isn't role=admin is redirected away before a
  // single audit_log row is queried (and RLS would return nothing anyway).
  if (session.profile.role !== 'admin') redirect('/');

  const sp = await searchParams;
  const userFilter = (sp.user || '').trim();
  const eventTypeFilter = (sp.eventType || '').trim();
  const page = Math.max(1, parseInt(sp.page || '1', 10) || 1);

  let rows: AuditRow[] = [];
  let total = 0;
  let loadError: string | null = null;
  // Reads run under the admin's OWN session — the audit_log SELECT policy is
  // admin-role-only, so no service key is needed (or present) anywhere.
  try {
    let query = session.supabase
      .from('audit_log')
      .select('id, ts, email, event, detail, ip', { count: 'exact' })
      .order('ts', { ascending: false });
    if (userFilter) query = query.ilike('email', `%${userFilter}%`);
    if (eventTypeFilter && EVENT_TYPES.includes(eventTypeFilter)) query = query.eq('event', eventTypeFilter);
    const from = (page - 1) * PAGE_SIZE;
    const { data, count, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows = (data as AuditRow[]) || [];
    total = count || 0;
  } catch (e) {
    loadError = e instanceof Error ? e.message : 'Could not load the activity log.';
  }

  // Users list for the access/reset panel (admin-only RLS select).
  const { data: profileRows } = await session.supabase
    .from('user_profiles')
    .select('email, name, role, regions')
    .order('role')
    .order('name');
  const users = (profileRows || []) as { email: string; name: string; role: string; regions: string[] | null }[];

  // The single live public share link, if one exists. share_links is
  // admin-only under RLS, so this read is itself the access check.
  const { data: shareRows } = await session.supabase
    .from('share_links')
    .select('id, token, label, created_at, hits, last_seen_at')
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
    .limit(1);
  const shareRow = (shareRows || [])[0] as
    | { id: string; token: string; label: string; created_at: string; hits: number; last_seen_at: string | null }
    | undefined;
  const activeShare: ShareLinkRow | null = shareRow
    ? {
        id: shareRow.id,
        url: shareUrl(shareRow.token),
        label: shareRow.label,
        created_at: shareRow.created_at,
        hits: shareRow.hits,
        last_seen_at: shareRow.last_seen_at,
      }
    : null;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (p: number) => {
    const params = new URLSearchParams();
    if (userFilter) params.set('user', userFilter);
    if (eventTypeFilter) params.set('eventType', eventTypeFilter);
    params.set('page', String(p));
    return `/admin/activity?${params.toString()}`;
  };

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <header>
        <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Activity Log</h1>
        <p className="text-text-secondary text-sm mt-1">
          Logins, page views, Ask AI questions, data access and report exports — visible only to admins. Times in IST.
        </p>
      </header>

      <ShareLinkPanel initial={activeShare} />

      <ResetLinkPanel users={users} />

      <form className="glass-panel p-4 sm:p-5 flex flex-wrap items-end gap-3" method="get" action="/admin/activity">
        <div className="flex flex-col gap-1">
          <label htmlFor="user" className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
            User
          </label>
          <input
            id="user"
            name="user"
            defaultValue={userFilter}
            placeholder="email contains…"
            list="user-emails"
            className="rounded-lg bg-black/30 border border-border-subtle px-3 py-2 text-sm text-white placeholder:text-text-secondary outline-none focus:border-brand-pink-500/60"
          />
          <datalist id="user-emails">
            {users.map((u) => (
              <option key={u.email} value={u.email} />
            ))}
          </datalist>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="eventType" className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
            Event type
          </label>
          <select
            id="eventType"
            name="eventType"
            defaultValue={eventTypeFilter}
            className="rounded-lg bg-black/30 border border-border-subtle px-3 py-2 text-sm text-white outline-none focus:border-brand-pink-500/60"
          >
            <option value="">All</option>
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-lg bg-brand-pink-500/20 border border-brand-pink-500/40 text-brand-pink-400 text-sm font-semibold px-4 py-2 hover:bg-brand-pink-500/30 transition-colors"
        >
          Filter
        </button>
        {(userFilter || eventTypeFilter) && (
          <a href="/admin/activity" className="text-sm text-text-secondary hover:text-white underline">
            Clear
          </a>
        )}
        <span className="ml-auto text-xs text-text-secondary">
          {total.toLocaleString('en-IN')} event{total === 1 ? '' : 's'}
        </span>
      </form>

      {loadError && (
        <div className="glass-panel p-4 sm:p-5 border border-red-500/30 text-sm text-red-400">
          Could not load the activity log: {loadError}
        </div>
      )}

      {!loadError && (
        <div className="glass-panel overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest text-text-secondary border-b border-border-subtle">
                <th className="text-left py-2.5 px-4 font-bold">Time (IST)</th>
                <th className="text-left py-2.5 px-4 font-bold">User</th>
                <th className="text-left py-2.5 px-4 font-bold">Event</th>
                <th className="text-left py-2.5 px-4 font-bold">Detail</th>
                <th className="text-left py-2.5 px-4 font-bold">IP</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border-subtle/40 hover:bg-surface/30 transition-colors">
                  <td className="py-2.5 px-4 text-text-secondary whitespace-nowrap">{fmt(r.ts)}</td>
                  <td className="py-2.5 px-4 text-white">
                    {r.email === 'shared-link' ? (
                      <span className="text-brand-pink-300 font-semibold">shared link</span>
                    ) : (
                      r.email || '—'
                    )}
                  </td>
                  <td className="py-2.5 px-4">
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide bg-brand-purple-900/40 border border-brand-purple-500/30 text-brand-purple-200">
                      {r.event}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-text-secondary max-w-[420px] truncate" title={detailPreview(r.detail)}>
                    {detailPreview(r.detail)}
                  </td>
                  <td className="py-2.5 px-4 text-text-secondary whitespace-nowrap">{r.ip || '—'}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-text-secondary">
                    No matching events.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && !loadError && (
        <div className="flex items-center justify-center gap-2 text-sm flex-wrap">
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .slice(0, 20)
            .map((p) => (
              <a
                key={p}
                href={qs(p)}
                className={`px-3 py-1.5 rounded-lg border ${
                  p === page
                    ? 'bg-brand-pink-500/20 border-brand-pink-500/40 text-brand-pink-400'
                    : 'border-border-subtle text-text-secondary hover:text-white'
                }`}
              >
                {p}
              </a>
            ))}
        </div>
      )}
    </div>
  );
}
