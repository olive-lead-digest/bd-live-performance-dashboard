'use client';

import { useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  Plus, X, ArrowUp, ArrowDown, GripVertical, Search, Rows3, Columns3, Sigma, Filter, Check,
} from 'lucide-react';
import {
  AGGS, AGG_LABEL, aggsFor, valueLabel,
  type AggId, type DatasetDef, type PivotField, type PivotMatrix, type ValueSpec, type ZoneId,
} from '@/lib/reportEngine';

/* ==================================================================
 * PivotBuilder — the drop zones, the field list and the pivot table.
 *
 * EVERY drag interaction has a click/keyboard equivalent:
 *   • add     — the "+" menu on each available field (and per-zone "+ Add")
 *   • remove  — the × on each chip
 *   • reorder — the ↑ / ↓ buttons on each chip
 * Drag-and-drop is an accelerator, never the only way to do something.
 * ================================================================== */

export const ZONE_META: Record<ZoneId, { label: string; hint: string; Icon: typeof Rows3 }> = {
  rows: { label: 'Rows', hint: 'Group the table down the side', Icon: Rows3 },
  cols: { label: 'Columns', hint: 'Spread the table across the top', Icon: Columns3 },
  values: { label: 'Values', hint: 'The numbers in the cells', Icon: Sigma },
  filters: { label: 'Filters', hint: 'Narrow the whole report', Icon: Filter },
};

export interface DragPayload {
  from: ZoneId | 'available';
  key: string;
  index: number;
}

const DND_MIME = 'application/x-olive-pivot-field';

/* ------------------------------------------------------------------ */
/* Available field list                                                */
/* ------------------------------------------------------------------ */

export function FieldList({
  def,
  onAdd,
  usage,
}: {
  def: DatasetDef;
  onAdd: (zone: ZoneId, key: string) => void;
  /** field key -> zones it is already used in, for the "in use" tick. */
  usage: Record<string, ZoneId[]>;
}) {
  const [q, setQ] = useState('');
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const order: PivotField['group'][] = ['Dimensions', 'Dates', 'Measures'];
    return order
      .map((g) => ({
        group: g,
        fields: def.fields.filter((f) => f.group === g && (!needle || f.label.toLowerCase().includes(needle))),
      }))
      .filter((g) => g.fields.length > 0);
  }, [def, q]);

  return (
    <div className="flex flex-col gap-3 min-w-0">
      <div className="relative">
        <Search aria-hidden="true" className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-secondary pointer-events-none" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search fields…"
          aria-label="Search available fields"
          className="w-full bg-surface border border-border-subtle rounded-lg pl-8 pr-2.5 py-2 min-h-[40px] text-xs text-white placeholder:text-text-secondary/70 focus:outline-none focus:border-brand-purple-400 focus-visible:ring-2 focus-visible:ring-brand-purple-400"
        />
      </div>

      <div className="flex flex-col gap-3 max-h-[420px] overflow-y-auto pr-1">
        {groups.length === 0 && <p className="text-[11px] text-text-secondary italic">No field matches “{q}”.</p>}
        {groups.map(({ group, fields }) => (
          <div key={group} className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-text-secondary">{group}</span>
            {fields.map((f) => {
              const used = usage[f.key] || [];
              const menuOpen = openMenu === f.key;
              return (
                <div key={f.key} className="relative">
                  <div
                    draggable
                    onDragStart={(e) => {
                      const payload: DragPayload = { from: 'available', key: f.key, index: -1 };
                      e.dataTransfer.setData(DND_MIME, JSON.stringify(payload));
                      e.dataTransfer.setData('text/plain', f.label);
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    className="flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface/70 pl-2 pr-1 min-h-[40px] cursor-grab active:cursor-grabbing hover:border-brand-pink-500/40 transition-colors"
                  >
                    <GripVertical aria-hidden="true" className="w-3.5 h-3.5 text-text-secondary/70 shrink-0" />
                    <span className="flex-1 min-w-0 truncate text-[11px] text-white/90" title={f.label}>
                      {f.label}
                      {f.numeric && <span className="ml-1 text-[9px] text-brand-purple-300 font-bold">#</span>}
                    </span>
                    {used.length > 0 && <Check aria-hidden="true" className="w-3.5 h-3.5 text-brand-pink-400 shrink-0" />}
                    <button
                      type="button"
                      onClick={() => setOpenMenu(menuOpen ? null : f.key)}
                      aria-expanded={menuOpen}
                      aria-haspopup="menu"
                      aria-label={`Add ${f.label} to a zone`}
                      className="shrink-0 w-10 h-10 flex items-center justify-center rounded-md text-text-secondary hover:text-white hover:bg-brand-pink-500/20 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-400"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>

                  {menuOpen && (
                    <div
                      role="menu"
                      aria-label={`Add ${f.label} to`}
                      className="absolute right-0 top-[42px] z-20 w-44 rounded-xl border border-border-subtle bg-panel shadow-2xl p-1 flex flex-col"
                    >
                      {(['rows', 'cols', 'values', 'filters'] as ZoneId[]).map((z) => (
                        <button
                          key={z}
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            onAdd(z, f.key);
                            setOpenMenu(null);
                          }}
                          className="flex items-center gap-2 px-2.5 min-h-[40px] rounded-lg text-[11px] text-text-secondary hover:text-white hover:bg-surface transition-colors text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-400"
                        >
                          {(() => {
                            const I = ZONE_META[z].Icon;
                            return <I aria-hidden="true" className="w-3.5 h-3.5 shrink-0" />;
                          })()}
                          Add to {ZONE_META[z].label}
                        </button>
                      ))}
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => setOpenMenu(null)}
                        className="px-2.5 min-h-[36px] rounded-lg text-[10px] text-text-secondary hover:text-white text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-400"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* A drop zone                                                         */
/* ------------------------------------------------------------------ */

function ChipButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="shrink-0 w-10 h-10 flex items-center justify-center rounded-md text-text-secondary hover:text-white hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-25 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-400"
    >
      {children}
    </button>
  );
}

export function Zone({
  zone,
  items,
  def,
  onDropPayload,
  onRemove,
  onMove,
  onAggChange,
  onLabelChange,
  onOpenPicker,
  addMenu,
}: {
  zone: ZoneId;
  /** Field keys for rows/cols/filters; ValueSpecs for values. */
  items: { key: string; label: string; spec?: ValueSpec; badge?: string }[];
  def: DatasetDef;
  onDropPayload: (payload: DragPayload, toIndex: number) => void;
  onRemove: (index: number) => void;
  onMove: (index: number, dir: -1 | 1) => void;
  onAggChange?: (index: number, agg: AggId) => void;
  onLabelChange?: (index: number, label: string) => void;
  onOpenPicker?: (key: string) => void;
  addMenu: React.ReactNode;
}) {
  const [over, setOver] = useState(false);
  const meta = ZONE_META[zone];
  const Icon = meta.Icon;
  const dropRef = useRef<HTMLDivElement>(null);

  const readPayload = (e: React.DragEvent): DragPayload | null => {
    try {
      const raw = e.dataTransfer.getData(DND_MIME);
      return raw ? (JSON.parse(raw) as DragPayload) : null;
    } catch {
      return null;
    }
  };

  return (
    <section
      aria-label={`${meta.label} zone`}
      className={clsx(
        'flex flex-col gap-2 rounded-xl border p-2.5 transition-colors min-w-0',
        over ? 'border-brand-pink-500 bg-brand-pink-500/10' : 'border-border-subtle bg-surface/40'
      )}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (!over) setOver(true);
      }}
      onDragLeave={(e) => {
        if (dropRef.current && !dropRef.current.contains(e.relatedTarget as Node)) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const p = readPayload(e);
        if (p) onDropPayload(p, items.length);
      }}
      ref={dropRef}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 min-w-0">
          <Icon aria-hidden="true" className="w-3.5 h-3.5 text-brand-pink-400 shrink-0" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-white truncate">{meta.label}</span>
          {items.length > 0 && (
            <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-brand-pink-500/20 border border-brand-pink-500/50 text-[9px] font-bold text-brand-pink-300 tabular-nums">
              {items.length}
            </span>
          )}
        </span>
        {addMenu}
      </div>

      {items.length === 0 ? (
        <p className="text-[10px] text-text-secondary italic px-1 py-2">Drop a field here, or use “+ Add”. {meta.hint}.</p>
      ) : (
        <ul className="flex flex-col gap-1.5 list-none m-0 p-0">
          {items.map((it, i) => {
            const field = def.fields.find((f) => f.key === it.key);
            return (
              <li
                key={it.spec ? it.spec.id : `${it.key}-${i}`}
                draggable
                onDragStart={(e) => {
                  const payload: DragPayload = { from: zone, key: it.key, index: i };
                  e.dataTransfer.setData(DND_MIME, JSON.stringify(payload));
                  e.dataTransfer.setData('text/plain', it.label);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setOver(false);
                  const p = readPayload(e);
                  if (p) onDropPayload(p, i);
                }}
                className="rounded-lg border border-border-subtle bg-panel/80"
              >
                <div className="flex items-center gap-1 pl-2 pr-1 min-h-[44px] cursor-grab active:cursor-grabbing">
                  <GripVertical aria-hidden="true" className="w-3.5 h-3.5 text-text-secondary/70 shrink-0" />
                  {onOpenPicker ? (
                    <button
                      type="button"
                      onClick={() => onOpenPicker(it.key)}
                      className="flex-1 min-w-0 truncate text-left text-[11px] font-medium text-white hover:text-brand-pink-300 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-400 rounded"
                      title={`Edit the ${it.label} filter`}
                    >
                      {it.label}
                      {it.badge && <span className="ml-1.5 text-[9px] font-bold text-brand-pink-300">{it.badge}</span>}
                    </button>
                  ) : (
                    <span className="flex-1 min-w-0 truncate text-[11px] font-medium text-white" title={it.label}>
                      {it.label}
                    </span>
                  )}
                  <ChipButton label={`Move ${it.label} up`} onClick={() => onMove(i, -1)} disabled={i === 0}>
                    <ArrowUp className="w-3.5 h-3.5" />
                  </ChipButton>
                  <ChipButton label={`Move ${it.label} down`} onClick={() => onMove(i, 1)} disabled={i === items.length - 1}>
                    <ArrowDown className="w-3.5 h-3.5" />
                  </ChipButton>
                  <ChipButton label={`Remove ${it.label}`} onClick={() => onRemove(i)}>
                    <X className="w-4 h-4" />
                  </ChipButton>
                </div>

                {it.spec && onAggChange && onLabelChange && (
                  <div className="flex flex-wrap items-center gap-1.5 px-2 pb-2">
                    <label className="sr-only" htmlFor={`agg-${it.spec.id}`}>
                      Aggregation for {field?.label || it.key}
                    </label>
                    <select
                      id={`agg-${it.spec.id}`}
                      value={it.spec.agg}
                      onChange={(e) => onAggChange(i, e.target.value as AggId)}
                      className="min-h-[36px] bg-surface border border-border-subtle rounded-md px-2 text-[11px] text-white cursor-pointer focus:outline-none focus:border-brand-purple-400 focus-visible:ring-2 focus-visible:ring-brand-purple-400"
                    >
                      {AGGS.map((a) => (
                        <option key={a.id} value={a.id} disabled={!aggsFor(field).includes(a.id)}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                    <label className="sr-only" htmlFor={`lbl-${it.spec.id}`}>
                      Column label for {field?.label || it.key}
                    </label>
                    <input
                      id={`lbl-${it.spec.id}`}
                      type="text"
                      value={it.spec.label}
                      placeholder={valueLabel({ ...it.spec, label: '' }, field)}
                      onChange={(e) => onLabelChange(i, e.target.value)}
                      className="flex-1 min-w-[90px] min-h-[36px] bg-surface border border-border-subtle rounded-md px-2 text-[11px] text-white placeholder:text-text-secondary/70 focus:outline-none focus:border-brand-purple-400 focus-visible:ring-2 focus-visible:ring-brand-purple-400"
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** The "+ Add" menu rendered in a zone header — the click/keyboard route in. */
export function ZoneAddMenu({
  zone,
  def,
  onAdd,
}: {
  zone: ZoneId;
  def: DatasetDef;
  onAdd: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const fields = zone === 'values' ? def.fields : def.fields.filter((f) => f.key !== '__records');
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-1 px-2 min-h-[32px] rounded-md border border-border-subtle bg-surface text-[10px] font-bold uppercase tracking-wider text-text-secondary hover:text-white hover:border-brand-pink-500/50 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-400"
      >
        <Plus className="w-3 h-3" aria-hidden="true" />
        Add
      </button>
      {open && (
        <div
          role="menu"
          aria-label={`Add a field to ${ZONE_META[zone].label}`}
          className="absolute right-0 top-9 z-30 w-56 max-h-64 overflow-y-auto rounded-xl border border-border-subtle bg-panel shadow-2xl p-1 flex flex-col"
        >
          {fields.map((f) => (
            <button
              key={f.key}
              type="button"
              role="menuitem"
              onClick={() => {
                onAdd(f.key);
                setOpen(false);
              }}
              className="px-2.5 min-h-[40px] rounded-lg text-[11px] text-text-secondary hover:text-white hover:bg-surface transition-colors text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-400"
            >
              {f.label}
              <span className="ml-1 text-[9px] text-text-secondary/70">{f.group}</span>
            </button>
          ))}
          <button
            type="button"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="px-2.5 min-h-[36px] rounded-lg text-[10px] text-text-secondary hover:text-white text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-400"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The pivot table                                                     */
/* ------------------------------------------------------------------ */

export function PivotTableView({ matrix, caption }: { matrix: PivotMatrix; caption: string }) {
  return (
    <div className="rounded-xl border border-border-subtle overflow-hidden min-w-0">
      {/* The TABLE scrolls inside this container — the page never scrolls sideways. */}
      <div className="overflow-x-auto overflow-y-auto max-h-[70vh]">
        <table className="text-[11px] border-collapse w-max min-w-full">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 z-20">
            {matrix.header.map((row, ri) => (
              <tr key={ri}>
                {row.map((c, ci) => {
                  const isLabelCol = ci < matrix.labelCols && ri === matrix.header.length - 1;
                  return (
                    <th
                      key={ci}
                      colSpan={c.span || 1}
                      scope={c.span && c.span > 1 ? 'colgroup' : 'col'}
                      className={clsx(
                        'text-left font-semibold uppercase tracking-wider px-2.5 py-2 whitespace-nowrap border-b border-border-subtle bg-surface',
                        ci >= matrix.labelCols && 'text-right',
                        c.totalCol ? 'text-brand-pink-300' : 'text-text-secondary',
                        isLabelCol && 'sticky left-0 z-10 bg-surface',
                        ci === 0 && ri < matrix.header.length - 1 && 'sticky left-0 z-10 bg-surface'
                      )}
                    >
                      {c.text}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {matrix.body.map((row, ri) => {
              const m = matrix.meta[ri];
              return (
                <tr
                  key={ri}
                  className={clsx(
                    m.kind === 'grand' && 'bg-brand-pink-500/15 font-bold',
                    m.kind === 'subtotal' && 'bg-white/[0.05] font-semibold',
                    m.kind === 'data' && 'odd:bg-white/[0.02]'
                  )}
                >
                  {row.map((c, ci) => {
                    if (ci < matrix.labelCols) {
                      const Tag = ci === 0 ? 'th' : 'td';
                      return (
                        <Tag
                          key={ci}
                          scope={ci === 0 ? 'row' : undefined}
                          className={clsx(
                            'px-2.5 py-1.5 text-left whitespace-nowrap max-w-[240px] truncate font-normal border-b border-border-subtle/50',
                            ci === 0 && 'sticky left-0 z-10',
                            ci === 0 && (m.kind === 'grand' ? 'bg-[#2a1020]' : m.kind === 'subtotal' ? 'bg-[#22212a]' : 'bg-panel'),
                            m.kind === 'grand' ? 'text-brand-pink-200' : 'text-white/90'
                          )}
                          title={c.text}
                        >
                          {c.text}
                        </Tag>
                      );
                    }
                    return (
                      <td
                        key={ci}
                        className={clsx(
                          'px-2.5 py-1.5 text-right tabular-nums whitespace-nowrap border-b border-border-subtle/50',
                          c.totalCol ? 'text-brand-pink-200 font-semibold' : 'text-white/90'
                        )}
                      >
                        {c.text}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export { AGG_LABEL };
