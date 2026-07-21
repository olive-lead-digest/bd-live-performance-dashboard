'use client';

import { useState, useRef, useEffect } from 'react';
import { useDashboard } from '@/lib/DashboardContext';
import { Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';

type Row = (string | number)[];
interface Sheet {
  name: string;
  header: string[];
  rows: Row[];
}

const inrPlain = (n?: number | null) =>
  n == null ? '' : `₹${Math.round(n).toLocaleString('en-IN')}`;
const numPlain = (n?: number | null) => (n == null ? '' : Math.round(n).toLocaleString('en-IN'));

// P2-3(2) — human-readable active-filter summary for the PDF snapshot header.
function describeFilters(f: any): string {
  if (!f) return 'None (all data)';
  const parts: string[] = [];
  if (f.from || f.to) parts.push(`Date ${f.from || '…'} to ${f.to || '…'}`);
  (['brand', 'region', 'state', 'city', 'cluster', 'status', 'prop', 'owner'] as const).forEach((k) => {
    const s = f[k] as Set<string> | undefined;
    if (s && s.size) parts.push(`${k}: ${Array.from(s).join(', ')}`);
  });
  return parts.length ? parts.join('  ·  ') : 'None (all data)';
}

// Build every export table from the live dashboard data.
function buildSheets(data: any): { sheets: Sheet[]; asOf: string } {
  const deals = data?.deals || {};
  const proposals = data?.proposals || {};
  const portfolio = deals.portfolio || {};
  const ytd = deals.ytd || {};
  const mtd = deals.mtd || {};
  const totals = deals.totals || {};
  const fees = deals.fees || {};
  const asOf = deals.generated || data?.generated || new Date().toISOString();

  const sheets: Sheet[] = [];

  // 1) KPI summary
  const kpi: Row[] = [
    ['Total leads', numPlain(Array.isArray(data?.leads) ? data.leads.length : null)],
    ['Total deals', numPlain(totals.deals)],
    ['MA signed', numPlain(totals.signed)],
    ['Keys contracted', numPlain(totals.keysContracted)],
    ['TA fees contracted', inrPlain(fees.contracted)],
    ['TA fees collected', inrPlain(fees.collected)],
    ['TA fees pending', inrPlain(fees.pending)],
    ['Portfolio — Olive MA', numPlain(portfolio.oliveMA)],
    ['Portfolio — Spark MA', numPlain(portfolio.sparkMA)],
    ['Portfolio — Open MA', numPlain(portfolio.openMA)],
    ['Portfolio — Spark LOI', numPlain(portfolio.sparkLOI)],
    ['MTD signings', numPlain(mtd?.signings?.count)],
    ['MTD collections (TA-Schedule actuals)', inrPlain(mtd?.collections?.amount)],
    ['YTD signings', numPlain(ytd?.signings?.count)],
    ['YTD collections (TA-Schedule actuals)', inrPlain(ytd?.collections?.amount)],
  ];
  sheets.push({ name: 'KPI Summary', header: ['Metric', 'Value'], rows: kpi });

  // 2) BD ranking
  const bdRank = Array.isArray(deals?.ranking?.bds) ? deals.ranking.bds : [];
  if (bdRank.length) {
    sheets.push({
      name: 'BD Ranking',
      header: ['Rank', 'Region', 'Region Head', 'BD', 'YTD Target', 'YTD Achieved', 'Achievement %'],
      rows: bdRank.map((r: any) => [
        r.rank ?? '', r.region ?? '', r.regionHead ?? '', r.bd ?? '',
        r.ytdTarget ?? '', r.ytdAchievement ?? '', r.achievementPct ?? '',
      ]),
    });
  }

  // 3) Region ranking
  const regionRank = Array.isArray(deals?.ranking?.regions) ? deals.ranking.regions : [];
  if (regionRank.length) {
    sheets.push({
      name: 'Region Ranking',
      header: ['Rank', 'Region', 'Region Head', 'BDs', 'YTD Target', 'YTD Achieved', 'Achievement %'],
      rows: regionRank.map((r: any) => [
        r.rank ?? '', r.region ?? '', r.regionHead ?? '', r.bds ?? '',
        r.ytdTarget ?? '', r.ytdAchievement ?? '', r.achievementPct ?? '',
      ]),
    });
  }

  // 4) Deals funnel
  const funnel = Array.isArray(deals.funnel) ? deals.funnel : [];
  if (funnel.length) {
    sheets.push({
      name: 'Deals Funnel',
      header: ['Stage', 'Count', 'Note'],
      rows: funnel.map((f: any) => [f.stage ?? '', f.count ?? 0, f.note ?? '']),
    });
  }

  // 5) Proposals
  const pt = proposals?.totals;
  if (pt) {
    sheets.push({
      name: 'Proposals',
      header: ['Metric', 'Value'],
      rows: [
        ['Proposals', numPlain(pt.proposals)],
        ['Approved', numPlain(pt.approved)],
        ['Rejected', numPlain(pt.rejected)],
        ['Pending', numPlain(pt.pending)],
        ['Approval rate %', pt.approvalRatePct ?? ''],
      ],
    });
  }

  // 6) Leads by source
  const src = data?.leadsBySource;
  if (src && typeof src === 'object') {
    const rows = Object.entries(src).map(([name, s]: [string, any]) => [
      name, s?.l ?? 0, s?.c ?? 0, s?.a ?? 0, s?.d ?? 0,
    ]);
    if (rows.length) {
      sheets.push({ name: 'Leads by Source', header: ['Source', 'Leads', 'Contacted', 'Active', 'Dropped'], rows });
    }
  }

  // 7) Upcoming signings
  const upcoming = Array.isArray(deals.upcoming) ? deals.upcoming : [];
  if (upcoming.length) {
    sheets.push({
      name: 'Upcoming Signings',
      header: ['Deal', 'Brand', 'BD', 'Region', 'Keys', 'TA Fee', 'Expected Date', 'Type'],
      rows: upcoming.map((u: any) => [
        u.dealName ?? '', u.brand ?? '', u.bd ?? '', u.region ?? '',
        u.keys ?? '', inrPlain(u.taFee), u.expectedDate ?? '', u.type ?? '',
      ]),
    });
  }

  // 8) BD directory
  const orgBds = data?.org?.bds;
  if (orgBds && typeof orgBds === 'object') {
    const rows = Object.entries(orgBds).map(([name, v]: [string, any]) => [
      v.region ?? '', v.regionHead ?? '', name, v.zoom ?? '', v.email ?? '',
    ]);
    if (rows.length) {
      sheets.push({ name: 'BD Directory', header: ['Region', 'Region Head', 'BD Name', 'Zoom', 'Email'], rows });
    }
  }

  return { sheets, asOf };
}

export function DownloadReport({ compact = false }: { compact?: boolean }) {
  const { data, filters, dealsRuntime, filteredLeads } = useDashboard();
  // Export what is on screen: the filtered leads and the recomputed (filtered)
  // deal aggregates, not the raw unfiltered feed.
  const reportData: any = data
    ? { ...data, leads: filteredLeads, deals: dealsRuntime.deals ?? (data as any).deals }
    : data;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<'excel' | 'pdf' | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  if (!data) return null;

  const stamp = () => new Date().toISOString().slice(0, 10);

  const exportExcel = async () => {
    setBusy('excel');
    try {
      const XLSX = await import('xlsx');
      const { sheets } = buildSheets(reportData);
      const wb = XLSX.utils.book_new();
      sheets.forEach((s) => {
        const ws = XLSX.utils.aoa_to_sheet([s.header, ...s.rows]);
        XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
      });
      XLSX.writeFile(wb, `Olive-BD-Report-${stamp()}.xlsx`);
    } catch (e) {
      console.error('Excel export failed', e);
    } finally {
      setBusy(null);
      setOpen(false);
    }
  };

  const exportPDF = async () => {
    setBusy('pdf');
    try {
      const { jsPDF } = await import('jspdf');
      const autoTable = (await import('jspdf-autotable')).default;
      const { sheets, asOf } = buildSheets(reportData);
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      const pink: [number, number, number] = [218, 26, 132];

      // Branded header
      doc.setFillColor(14, 14, 17);
      doc.rect(0, 0, doc.internal.pageSize.getWidth(), 70, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text('Olive Hospitality', 40, 34);
      doc.setTextColor(...pink);
      doc.setFontSize(11);
      doc.text('Business Development — Performance Report', 40, 52);
      doc.setTextColor(150, 150, 160);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Generated ${new Date().toLocaleString('en-IN')} · Data as of ${asOf}`, doc.internal.pageSize.getWidth() - 40, 40, { align: 'right' });

      // P2-3(2) — the snapshot must state the active filters + data-as-of stamp.
      doc.setTextColor(90, 90, 100);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.text(`Active filters: ${describeFilters(filters)}`, 40, 86);
      doc.text(`Data as of: ${asOf}`, 40, 98);

      const pageH = doc.internal.pageSize.getHeight();
      let y = 114;
      sheets.forEach((s) => {
        if (y > pageH - 100) {
          doc.addPage();
          y = 60;
        }
        // Section title
        doc.setTextColor(80, 40, 117);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text(s.name, 40, y);
        y += 8;
        autoTable(doc, {
          head: [s.header],
          body: s.rows.map((r) => r.map((c) => (c == null ? '' : String(c)))),
          startY: y,
          margin: { left: 40, right: 40 },
          styles: { fontSize: 8, cellPadding: 4, textColor: [40, 40, 50] },
          headStyles: { fillColor: pink, textColor: [255, 255, 255], fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [245, 240, 248] },
        });
        // @ts-expect-error autotable augments doc with lastAutoTable
        y = (doc.lastAutoTable?.finalY ?? y) + 28;
      });

      doc.save(`Olive-BD-Report-${stamp()}.pdf`);
    } catch (e) {
      console.error('PDF export failed', e);
    } finally {
      setBusy(null);
      setOpen(false);
    }
  };

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={
          'flex items-center gap-2 rounded-lg bg-brand-pink-500/15 hover:bg-brand-pink-500/25 border border-brand-pink-500/40 transition-colors group ' +
          (compact ? 'px-2.5 py-1.5' : 'px-3 py-1.5')
        }
        title="Download report"
      >
        <Download className="w-4 h-4 text-brand-pink-400" />
        {!compact && <span className="text-xs font-semibold text-brand-pink-400 group-hover:text-brand-pink-300">Report</span>}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-52 rounded-xl glass-panel p-1.5 z-50 shadow-2xl">
          <button
            onClick={exportExcel}
            disabled={busy !== null}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface/60 transition-colors text-left disabled:opacity-50"
          >
            {busy === 'excel' ? <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 text-emerald-400" />}
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-white">Excel (.xlsx)</span>
              <span className="text-[10px] text-text-secondary">All tables, one sheet each</span>
            </div>
          </button>
          <button
            onClick={exportPDF}
            disabled={busy !== null}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface/60 transition-colors text-left disabled:opacity-50"
          >
            {busy === 'pdf' ? <Loader2 className="w-4 h-4 text-brand-pink-400 animate-spin" /> : <FileText className="w-4 h-4 text-brand-pink-400" />}
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-white">PDF snapshot</span>
              <span className="text-[10px] text-text-secondary">Branded, print-ready</span>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
