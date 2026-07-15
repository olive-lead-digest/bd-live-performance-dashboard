'use client';

import { X, TrendingUp, AlertTriangle, CheckCircle2, BarChart2, Info, Target, Zap } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, AreaChart, Area, Legend, LineChart, Line } from 'recharts';
import { useDialog } from '@/lib/useDialog';

export type InsightData = {
  id: string;
  title: string;
  implication: string;
  evidenceType: 'bar-chart' | 'area-chart' | 'stat-cards' | 'data-table' | 'line-chart' | 'alert-box';
  evidenceData?: any;
};

export function InsightModal({ insight, onClose }: { insight: InsightData | null; onClose: () => void }) {
  if (!insight) return null;
  return <InsightDialog insight={insight} onClose={onClose} />;
}

// P2-3 — full modal dialog semantics (role="dialog" + aria-modal, labelled by
// the observation title, focus trap + ESC + focus restore, labelled close).
// Split out so the useDialog hook mounts only when a modal is open.
function InsightDialog({ insight, onClose }: { insight: InsightData; onClose: () => void }) {
  const dialogRef = useDialog<HTMLDivElement>(onClose);

  const renderEvidence = () => {
    switch (insight.evidenceType) {
      case 'bar-chart':
        return (
          <div className="h-64 w-full mt-4" role="img" aria-label={`Bar chart of quantitative evidence for: ${insight.title}`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={insight.evidenceData.data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2930" vertical={false} />
                <XAxis dataKey={insight.evidenceData.xAxis} stroke="#9896a3" tick={{fill: '#9896a3', fontSize: 12}} tickLine={false} axisLine={false} />
                <YAxis stroke="#9896a3" tick={{fill: '#9896a3', fontSize: 12}} tickLine={false} axisLine={false} />
                <Tooltip cursor={{fill: '#2a2930', opacity: 0.4}} contentStyle={{ backgroundColor: '#16151a', border: '1px solid #2a2930', borderRadius: '8px' }} />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                {insight.evidenceData.bars.map((bar: any) => (
                  <Bar key={bar.key} dataKey={bar.key} fill={bar.color} radius={[4, 4, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        );

      case 'area-chart':
        return (
          <div className="h-64 w-full mt-4 relative" role="img" aria-label={`Area chart of quantitative evidence for: ${insight.title}`}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={insight.evidenceData.data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2930" vertical={false} />
                <XAxis dataKey={insight.evidenceData.xAxis} stroke="#9896a3" tick={{fill: '#9896a3', fontSize: 11}} tickLine={false} axisLine={false} />
                <YAxis stroke="#9896a3" tick={{fill: '#9896a3', fontSize: 12}} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#16151a', border: '1px solid #2a2930', borderRadius: '8px' }} />
                {insight.evidenceData.areas.length > 1 && <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />}
                {insight.evidenceData.areas.map((area: any) => (
                  <Area key={area.key} type="monotone" dataKey={area.key} stroke={area.color} fill={area.color} fillOpacity={0.2} strokeWidth={3} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
            {insight.evidenceData.alert && (
              <div className="mt-2 text-center text-xs text-brand-pink-400 font-semibold flex justify-center items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> {insight.evidenceData.alert}
              </div>
            )}
          </div>
        );

      case 'line-chart':
        return (
          <div className="h-64 w-full mt-4" role="img" aria-label={`Line chart of quantitative evidence for: ${insight.title}`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={insight.evidenceData.data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2930" vertical={false} />
                <XAxis dataKey={insight.evidenceData.xAxis} stroke="#9896a3" tick={{fill: '#9896a3', fontSize: 12}} tickLine={false} axisLine={false} />
                <YAxis stroke="#9896a3" tick={{fill: '#9896a3', fontSize: 12}} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#16151a', border: '1px solid #2a2930', borderRadius: '8px' }} />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                {insight.evidenceData.lines.map((line: any) => (
                  <Line key={line.key} type="monotone" dataKey={line.key} stroke={line.color} strokeWidth={3} dot={{ r: 4, fill: '#16151a', strokeWidth: 2 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        );

      case 'stat-cards':
        return (
          <div className="grid grid-cols-2 gap-4 mt-6">
            {insight.evidenceData.cards.map((card: any, i: number) => (
              <div key={i} className={`glass-card p-4 flex flex-col items-center justify-center text-center ${card.highlight ? 'border-brand-pink-500/30' : ''}`}>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 ${card.highlight ? 'bg-brand-pink-500/20' : 'bg-brand-purple-500/20'}`}>
                  {card.icon === 'check' ? <CheckCircle2 className={`w-6 h-6 ${card.highlight ? 'text-brand-pink-400' : 'text-brand-purple-400'}`} /> : <BarChart2 className={`w-6 h-6 ${card.highlight ? 'text-brand-pink-400' : 'text-brand-purple-400'}`} />}
                </div>
                <h4 className="text-white font-bold text-lg">{card.title}</h4>
                <p className="text-text-secondary text-xs uppercase tracking-wider mt-1">{card.subtitle}</p>
                <div className={`text-2xl font-black mt-2 ${card.highlight ? 'text-brand-pink-400' : 'text-white'}`}>
                  {card.value}<span className="text-sm font-medium text-text-secondary">{card.suffix}</span>
                </div>
              </div>
            ))}
          </div>
        );

      case 'data-table':
        return (
          <div className="mt-6 overflow-x-auto no-scrollbar">
            <table className="w-full min-w-[320px] text-left border-collapse">
              <thead>
                <tr className="border-b border-border-subtle text-xs uppercase tracking-wider text-text-secondary">
                  {insight.evidenceData.columns.map((col: string, i: number) => (
                    <th key={i} className={`pb-3 font-semibold ${i > 0 ? 'text-right' : ''}`}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-sm text-white">
                {insight.evidenceData.rows.map((row: any[], i: number) => (
                  <tr key={i} className="border-b border-border-subtle/50 hover:bg-surface/30 transition-colors">
                    {row.map((cell: any, j: number) => (
                      <td key={j} className={`py-3 ${j === 0 ? 'font-medium' : 'text-right'} ${cell.color || ''}`}>
                        {cell.value}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );

      case 'alert-box':
        return (
          <div className="mt-6 bg-brand-pink-900/20 border border-brand-pink-500/30 rounded-xl p-5 flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-brand-pink-500/20 flex items-center justify-center shrink-0">
              <Info className="w-5 h-5 text-brand-pink-400" />
            </div>
            <div>
              <h4 className="text-white font-bold mb-1">{insight.evidenceData.title}</h4>
              <p className="text-text-secondary text-sm leading-relaxed">{insight.evidenceData.description}</p>
            </div>
          </div>
        );

      default:
        return <div className="mt-4 text-text-secondary italic">Quantifying evidence...</div>;
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] transition-opacity animate-in fade-in" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="insight-modal-title"
        tabIndex={-1}
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-1.5rem)] max-w-3xl max-h-[90vh] overflow-y-auto no-scrollbar bg-panel border border-border-subtle shadow-[0_0_80px_rgba(0,0,0,0.5)] rounded-2xl z-[110] animate-in zoom-in-95 duration-300 focus:outline-none"
      >
        
        {/* Header */}
        <div className="px-4 sm:px-8 py-4 sm:py-6 border-b border-border-subtle bg-surface/30 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-purple-900/40 border border-brand-purple-500/30 flex items-center justify-center shrink-0">
              <Target className="w-5 h-5 text-brand-purple-400" />
            </div>
            <div>
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-text-secondary mb-1">Strategic Observation</h2>
              <p id="insight-modal-title" className="text-xl font-bold text-white leading-tight pr-8">{insight.title}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 -mr-2 rounded-lg hover:bg-surface text-text-secondary hover:text-white transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-8">
          <div className="bg-surface/50 border border-border-subtle p-5 rounded-xl mb-8 relative overflow-hidden flex gap-4 items-start">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand-pink-500" />
            <Zap className="w-5 h-5 text-brand-pink-400 mt-0.5 shrink-0" />
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-brand-pink-400 mb-2">Executive Implication</h3>
              <p className="text-white text-sm leading-relaxed">{insight.implication}</p>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-text-secondary border-b border-border-subtle pb-2">Quantitative Evidence</h3>
            {renderEvidence()}
          </div>
        </div>

      </div>
    </>
  );
}
