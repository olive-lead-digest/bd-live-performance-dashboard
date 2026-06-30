'use client';

import { X } from 'lucide-react';
import { useDashboard } from '@/lib/DashboardContext';
import clsx from 'clsx';
import { useState, useMemo } from 'react';

const FILTER_CONFIG = [
  { key: 'brand', label: 'Brand' },
  { key: 'region', label: 'Region' },
  { key: 'tier', label: 'Tier' },
  { key: 'status', label: 'Status' },
  { key: 'cluster', label: 'Cluster' },
  { key: 'state', label: 'State' },
  { key: 'city', label: 'City' },
  { key: 'prop', label: 'Property Status' },
  { key: 'owner', label: 'BD Rep' }
] as const;

export function FilterDrawer({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { data, filters, setFilter, clearFilters, setDateRange } = useDashboard();
  
  // Extract unique values from data for dropdowns
  const options = useMemo(() => {
    if (!data) return {} as Record<string, string[]>;
    const res: Record<string, Set<string>> = {};
    FILTER_CONFIG.forEach(c => res[c.key] = new Set());
    
    data.leads.forEach(l => {
      if (l.brand) res.brand.add(l.brand);
      if (l.region) res.region.add(l.region);
      if (l.tier) res.tier.add(l.tier);
      if (l.status) res.status.add(l.status);
      else res.status.add('(unassigned)');
      if (l.cluster) res.cluster.add(l.cluster);
      if (l.state) res.state.add(l.state);
      if (l.city) res.city.add(l.city);
      if (l.prop) res.prop.add(l.prop);
      if (l.owner) res.owner.add(l.owner);
    });
    
    const final: Record<string, string[]> = {};
    Object.keys(res).forEach(k => {
      final[k] = Array.from(res[k]).filter(Boolean).sort();
    });
    return final;
  }, [data]);

  if (!isOpen) return null;

  return (
    <>
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity" 
        onClick={onClose}
      />
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-sm bg-panel border-l border-border-subtle shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300">
        <div className="flex items-center justify-between p-6 border-b border-border-subtle">
          <h2 className="text-lg font-semibold text-white">Filters</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-surface text-text-secondary hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">Date Range</span>
            <div className="flex gap-2">
              <input 
                type="date" 
                value={filters.from}
                onChange={(e) => setDateRange(e.target.value, filters.to)}
                className="flex-1 bg-surface border border-border-subtle rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-purple-400"
              />
              <input 
                type="date" 
                value={filters.to}
                onChange={(e) => setDateRange(filters.from, e.target.value)}
                className="flex-1 bg-surface border border-border-subtle rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-purple-400"
              />
            </div>
          </div>

          {FILTER_CONFIG.map(({ key, label }) => {
            const list = options[key] || [];
            if (!list.length) return null;
            const activeSet = filters[key as keyof typeof filters] as Set<string>;
            
            return (
              <div key={key} className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary flex justify-between">
                  {label} {activeSet.size > 0 && <span className="text-brand-pink-400">({activeSet.size})</span>}
                </span>
                <div className="flex flex-wrap gap-2">
                  {list.map(val => {
                    const isActive = activeSet.has(val);
                    return (
                      <button
                        key={val}
                        onClick={() => setFilter(key as any, val)}
                        className={clsx(
                          "px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 border",
                          isActive 
                            ? "bg-brand-purple-600/50 border-brand-purple-400 text-white shadow-[0_0_10px_rgba(80,40,117,0.3)]" 
                            : "bg-surface border-border-subtle text-text-secondary hover:text-white hover:border-brand-purple-800"
                        )}
                      >
                        {val}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="p-6 border-t border-border-subtle flex gap-3">
          <button 
            onClick={clearFilters}
            className="flex-1 py-2.5 rounded-xl border border-border-subtle text-sm font-semibold text-white hover:bg-surface transition-colors"
          >
            Clear All
          </button>
          <button 
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-brand-pink-500 text-sm font-bold text-white hover:bg-brand-pink-400 transition-colors shadow-[0_0_15px_rgba(218,26,132,0.4)]"
          >
            Apply Filters
          </button>
        </div>
      </div>
    </>
  );
}
