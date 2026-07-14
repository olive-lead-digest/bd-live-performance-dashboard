'use client';

import { useDashboard } from '@/lib/DashboardContext';
import { calculateRates, groupCounts, buildLeaderboard } from '@/lib/utils';
import { useMemo, useState } from 'react';
import { ComposableMap, Geographies, Geography as GeoPath, ZoomableGroup, Marker, Line as GeoLine } from 'react-simple-maps';
import clsx from 'clsx';
import { MapPin, ZoomIn, ZoomOut, RotateCcw, Search, Crosshair, Users, Activity, AlertTriangle, ArrowRight } from 'lucide-react';
import { ExecSummary, SummaryBullet } from '@/components/ExecSummary';
import { LeadsAsOfStamp } from '@/components/DataBadges';
import { compactNum } from '@/lib/format';
import { CsvButton } from '@/components/CsvButton';
import { useDrill } from '@/components/DrillDrawer';

const geoUrl = "/world.json";
// Analyst correction: the ₹12,500×lead-count ESTIMATES were removed. Geography now
// shows plain lead counts per region / city (and on the map), never estimated ₹.
const fmt = (n: number) => compactNum(n);

const CITY_DATA: Record<string, { coords: [number, number], state: string }> = {
  "Bangalore": { coords: [77.5946, 12.9716], state: "KA" },
  "Bengaluru": { coords: [77.6246, 12.9416], state: "KA" },
  "Mumbai": { coords: [72.8777, 19.0760], state: "MH" },
  "Delhi": { coords: [77.2090, 28.6139], state: "DL" },
  "New Delhi": { coords: [77.2390, 28.5839], state: "DL" },
  "Pune": { coords: [73.8567, 18.5204], state: "MH" },
  "Hyderabad": { coords: [78.4867, 17.3850], state: "TG" },
  "Chennai": { coords: [80.2707, 13.0827], state: "TN" },
  "Kolkata": { coords: [88.3639, 22.5726], state: "WB" },
  "Ahmedabad": { coords: [72.5714, 23.0225], state: "GJ" },
  "Jaipur": { coords: [75.7873, 26.9124], state: "RJ" },
  "Goa": { coords: [74.1240, 15.2993], state: "GA" },
  "Gurgaon": { coords: [77.0266, 28.4595], state: "HR" },
  "Noida": { coords: [77.3910, 28.5355], state: "UP" },
  "Kochi": { coords: [76.2673, 9.9312], state: "KL" },
  "Chandigarh": { coords: [76.7794, 30.7333], state: "CH" },
  "Indore": { coords: [75.8577, 22.7196], state: "MP" }
};

export default function Geography() {
  const { filteredLeads, data, isLoading, filters } = useDashboard();
  const { openDrill } = useDrill();
  const [searchQuery, setSearchQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [tooltipContent, setTooltipContent] = useState("");
  const [position, setPosition] = useState({ coordinates: [80, 22] as [number, number], zoom: 1 }); 

  // Autocomplete Logic
  const suggestions = useMemo(() => {
    if (!searchQuery.trim() || !isFocused) return [];
    const query = searchQuery.trim().toLowerCase();
    const options = new Set<string>();
    
    if ('spark'.includes(query)) options.add('Spark');
    if ('open hotels'.includes(query)) options.add('Open Hotels');
    if ('olive'.includes(query)) options.add('Olive');

    filteredLeads.forEach(l => {
      if (l.owner && l.owner.toLowerCase().includes(query)) options.add(l.owner);
      if (l.region && l.region.toLowerCase().includes(query)) options.add(l.region);
      if (l.city && l.city.toLowerCase().includes(query)) options.add(l.city);
    });

    return Array.from(options).filter(opt => opt.toLowerCase() !== query).slice(0, 8);
  }, [filteredLeads, searchQuery, isFocused]);

  // Global Filter based on Search
  const searchFiltered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return filteredLeads;
    
    return filteredLeads.filter(l => {
      return (
        (l.owner && l.owner.toLowerCase().includes(query)) ||
        (l.region && l.region.toLowerCase().includes(query)) ||
        (l.city && l.city.toLowerCase().includes(query)) ||
        (l.brand && l.brand.toLowerCase() === query)
      );
    });
  }, [filteredLeads, searchQuery]);

  // Regional Data Calculation
  const regionalData = useMemo(() => {
    const rCounts = groupCounts(searchFiltered, 'region');
    // Exclude the untagged bucket from the region RANKING — "Unknown" is a missing
    // tag, not a region, so it must never appear as the top region (P2-6). Its
    // pipeline is surfaced separately as a data-hygiene figure below.
    const validRegions = Object.keys(rCounts).filter(r => r && r !== '(none)' && r !== 'Other' && r !== 'Unknown');
    
    return validRegions.map(r => {
      const leadsInRegion = searchFiltered.filter(l => l.region === r);
      const rates = calculateRates(leadsInRegion);
      return {
        name: r,
        total: leadsInRegion.length,
        activeRate: rates.activeR,
        active: rates.active
      };
      // Stable sort: lead count desc, then name asc so ties never reorder across reloads.
    }).sort((a,b) => b.total - a.total || a.name.localeCompare(b.name)).slice(0, 4);
  }, [searchFiltered]);

  // City Data Calculation
  const cityData = useMemo(() => {
    const counts = groupCounts(searchFiltered, 'city');
    return Object.keys(counts)
      .filter(city => CITY_DATA[city])
      .map(city => {
        const ls = searchFiltered.filter(l => l.city === city);
        const rates = calculateRates(ls);
        return {
          name: city,
          coords: CITY_DATA[city].coords,
          state: CITY_DATA[city].state,
          leads: counts[city],
          activeCount: rates.active,
          active: rates.activeR
        };
      })
      // Stable sort: lead count desc, then name asc (deterministic top-N).
      .sort((a, b) => b.leads - a.leads || a.name.localeCompare(b.name));
  }, [searchFiltered]);

  // City Dossier Calculation
  const dossierData = useMemo(() => {
    if (!selectedCity) return null;
    const cityLeads = searchFiltered.filter(l => l.city === selectedCity);
    if (cityLeads.length === 0) return null;
    
    const rates = calculateRates(cityLeads);
    const bdsData = data?.bds || {};
    const weightsData = data?.weights || { Q: 1, Cv: 1, Cmp: 1, Lv: 1, Cav: 1 };
    
    const localLeaderboard = buildLeaderboard(cityLeads, bdsData, weightsData)
      .sort((a, b) => (b.bps?.score || 0) - (a.bps?.score || 0))
      .slice(0, 5);

    return {
      name: selectedCity,
      state: CITY_DATA[selectedCity]?.state || '',
      total: cityLeads.length,
      active: rates.active,
      activeRate: rates.activeR,
      leaderboard: localLeaderboard
    };
  }, [selectedCity, searchFiltered, data]);

  const summaryBullets = useMemo<SummaryBullet[]>(() => {
    const b: SummaryBullet[] = [];
    if (!cityData.length && !regionalData.length) return b;
    const topCity = cityData[0];
    if (topCity) b.push({ tone: 'up', text: `${topCity.name} is the top market with ${topCity.leads.toLocaleString('en-IN')} leads (${topCity.active.toFixed(1)}% active).` });
    const topRegion = regionalData[0];
    if (topRegion) b.push({ tone: 'info', text: `${topRegion.name} leads all tagged regions with ${topRegion.total.toLocaleString('en-IN')} leads.` });
    // P2-6 — surface untagged-region leads as a data-hygiene figure, never as a
    // "region" that "leads".
    const untaggedRegionLeads = searchFiltered.filter(l => !l.region || l.region === 'Unknown' || l.region === '(none)' || l.region === 'Other');
    if (untaggedRegionLeads.length > 0) b.push({ tone: 'warn', text: `${untaggedRegionLeads.length.toLocaleString('en-IN')} leads have no region tag — a routing / data-hygiene gap.` });
    const healthy = cityData.filter(c => c.active >= 15).length;
    const weak = cityData.filter(c => c.active < 10).length;
    b.push(weak > healthy
      ? { tone: 'warn', text: `${weak} mapped cit${weak !== 1 ? 'ies' : 'y'} are below a 10% conversion floor — coverage quality is uneven.` }
      : { tone: 'up', text: `${healthy} cit${healthy !== 1 ? 'ies' : 'y'} sit in a healthy conversion band (15%+).` });
    const unmappedN = searchFiltered.filter(l => !l.city || l.city === 'Other' || !CITY_DATA[l.city]).length;
    if (unmappedN > 0) b.push({ tone: 'warn', text: `${unmappedN.toLocaleString()} leads aren't mapped to a known city — a geographic blind spot.` });
    return b;
  }, [cityData, regionalData, searchFiltered]);

  const maxLeads = Math.max(...cityData.map(c => c.leads), 1);

  // P2-7 — unmapped = leads with no known-city mapping. This is Geography's real
  // headline (a large share of leads carry no usable city), so it is promoted to
  // a first-class card with a drill-down + CSV that feeds the Zoho hygiene queue.
  const unmappedLeads = useMemo(
    () => searchFiltered.filter(l => !l.city || l.city === 'Other' || !CITY_DATA[l.city]),
    [searchFiltered]
  );
  const unmapped = unmappedLeads.length;
  const unmappedPct = searchFiltered.length ? (unmapped / searchFiltered.length) * 100 : 0;

  // State-level roll-up from the mapped cities (city data is sparse, so a state
  // table is the honest aggregation; a true choropleth is a follow-up — see report).
  const stateData = useMemo(() => {
    const agg: Record<string, { state: string; leads: number; activeCount: number }> = {};
    cityData.forEach(c => {
      const s = c.state || '—';
      if (!agg[s]) agg[s] = { state: s, leads: 0, activeCount: 0 };
      agg[s].leads += c.leads;
      agg[s].activeCount += c.activeCount;
    });
    return Object.values(agg).sort((a, b) => b.leads - a.leads || a.state.localeCompare(b.state));
  }, [cityData]);

  const openUnmapped = () =>
    openDrill({
      title: 'Unmapped leads',
      subtitle: `${unmapped.toLocaleString()} lead${unmapped === 1 ? '' : 's'} (${unmappedPct.toFixed(1)}%) with no mapped city`,
      columns: [
        { key: 'name', label: 'BD', format: (r: any) => r.owner || 'Unassigned' },
        { key: 'region', label: 'Region', format: (r: any) => r.region || 'Unknown' },
        { key: 'brand', label: 'Brand', format: (r: any) => r.brand || '—' },
        { key: 'city', label: 'City (raw)', format: (r: any) => r.city || '(blank)' },
        { key: 'status', label: 'Status', format: (r: any) => r.status || '(unassigned)' },
        { key: 'dt', label: 'Date', align: 'right', format: (r: any) => r.dt || '' },
      ],
      rows: unmappedLeads,
      csvFilename: 'geography-unmapped-leads',
    });

  const getHealthColor = (activeRate: number) => {
    if (activeRate >= 15) return { fill: '#10b981', glow: 'rgba(16,185,129,0.9)', text: 'text-emerald-400', border: 'border-emerald-500/30', bg: 'bg-emerald-500/10' };
    if (activeRate >= 10) return { fill: '#f59e0b', glow: 'rgba(245,158,11,0.9)', text: 'text-amber-400', border: 'border-amber-500/30', bg: 'bg-amber-500/10' };
    return { fill: '#ef4444', glow: 'rgba(239,68,68,0.9)', text: 'text-red-400', border: 'border-red-500/30', bg: 'bg-red-500/10' };
  };

  const handleZoomIn = () => {
    if (position.zoom >= 24) return;
    setPosition(pos => ({ ...pos, zoom: pos.zoom * 1.5 }));
  };

  const handleZoomOut = () => {
    if (position.zoom <= 1) return;
    setPosition(pos => ({ ...pos, zoom: pos.zoom / 1.5 }));
  };

  const handleReset = () => {
    setPosition({ coordinates: [80, 22], zoom: 1 });
    setSelectedCity(null);
  };

  const handleCityClick = (city: string, coords: [number, number]) => {
    setSelectedCity(city);
    setPosition({ coordinates: coords, zoom: 16 });
  };

  if (isLoading) return null;

  return (
    <div className="pb-20">
      <header className="mb-6 flex flex-col xl:flex-row xl:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight flex flex-wrap items-center gap-x-3 gap-y-2">
            Spatial Performance Engine
            {searchQuery && (
              <span className="text-brand-pink-400 text-sm font-semibold bg-brand-pink-500/10 px-2.5 py-1 rounded-md border border-brand-pink-500/20 uppercase tracking-wider">
                {searchQuery}
              </span>
            )}
          </h1>
          <p className="text-text-secondary text-sm mt-1">
            {searchQuery ? `Mapping performance impact for "${searchQuery}".` : "Interactive geographical mapping & regional dossier tracking."}
          </p>
        </div>
        
        <div className="relative z-50">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary pointer-events-none" />
          <input 
            type="text" 
            placeholder="Search BD, Region, or Brand..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setTimeout(() => setIsFocused(false), 150)}
            className="w-full sm:w-72 pl-9 pr-4 py-2 bg-surface/50 border border-border-subtle rounded-lg text-sm text-white placeholder:text-text-secondary focus:outline-none focus:border-brand-pink-500/50 focus:bg-surface/80 transition-all shadow-[0_0_15px_rgba(218,26,132,0.1)]"
          />
          {suggestions.length > 0 && (
            <div className="absolute top-full mt-2 left-0 w-full sm:w-72 bg-[#16151a] border border-border-subtle rounded-lg shadow-[0_4px_30px_rgba(0,0,0,0.5)] overflow-hidden z-50">
              {suggestions.map(s => (
                <button
                  key={s}
                  onClick={() => {
                    setSearchQuery(s);
                    setIsFocused(false);
                  }}
                  className="w-full text-left px-4 py-2.5 text-sm text-text-secondary hover:bg-brand-purple-900/40 hover:text-white transition-colors border-b border-border-subtle/50 last:border-0"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <ExecSummary bullets={summaryBullets} />
      <LeadsAsOfStamp className="mb-4" />

      {/* P2-7 — Unmapped leads: Geography's real headline, promoted to a
          first-class card with a drill-down + CSV (Zoho hygiene queue). */}
      {unmapped > 0 && (
        <button
          onClick={openUnmapped}
          className="w-full text-left glass-panel p-4 sm:p-5 mb-6 border border-amber-500/30 hover:border-amber-500/50 bg-amber-500/[0.04] transition-colors flex items-center gap-4 group relative z-10"
        >
          <span className="w-11 h-11 shrink-0 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-widest text-amber-300">Data hygiene · Unmapped leads</div>
            <div className="text-2xl sm:text-3xl font-black text-white tracking-tight mt-0.5">
              {unmapped.toLocaleString()} <span className="text-base font-bold text-amber-400">({unmappedPct.toFixed(1)}%)</span>
            </div>
            <p className="text-xs text-text-secondary mt-1">
              No known city mapping. Tap to view the full list and export a CSV for the Zoho hygiene queue.
            </p>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-300 text-[11px] font-bold uppercase tracking-wider shrink-0 group-hover:bg-amber-500/25 transition-colors">
            View list <ArrowRight className="w-3.5 h-3.5" />
          </span>
        </button>
      )}

      {/* Macro-Regional Row */}
      {regionalData.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {regionalData.map(r => {
            const health = getHealthColor(r.activeRate);
            const isSelected = searchQuery.toLowerCase() === r.name.toLowerCase();
            return (
              <button 
                key={r.name} 
                onClick={() => {
                  if (isSelected) {
                    setSearchQuery("");
                  } else {
                    setSearchQuery(r.name);
                    setSelectedCity(null);
                  }
                }}
                className={clsx(
                  "glass-card p-4 border text-left transition-all hover:bg-surface/80 group", 
                  health.border,
                  isSelected ? "ring-2 ring-brand-pink-500 bg-surface/50 shadow-[0_0_15px_rgba(218,26,132,0.2)]" : ""
                )}
              >
                <h3 className="text-[10px] text-text-secondary uppercase tracking-wider group-hover:text-white transition-colors">{r.name} Region</h3>
                <div className="flex justify-between items-end mt-2">
                  <div className="flex flex-col">
                    <span className="text-xl font-black text-white">{r.total.toLocaleString('en-IN')}</span>
                    <span className="text-[10px] text-text-secondary uppercase">Leads</span>
                  </div>
                  <span className={clsx("text-sm font-bold px-2 py-0.5 rounded-md", health.bg, health.text)}>{r.activeRate.toFixed(1)}% Act</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6">
        {/* Map */}
        <div className="glass-panel p-4 sm:p-6 xl:col-span-2 min-h-[380px] sm:min-h-[500px] flex flex-col relative overflow-hidden group border-brand-purple-500/20 shadow-[0_0_30px_rgba(80,40,117,0.15)]">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-brand-purple-900/30 via-transparent to-transparent opacity-60" />
          
          <div className="flex items-center justify-between z-10 relative mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-white">Conversion Health Map</h2>
            <div className="flex items-center gap-2">
              <button onClick={handleZoomIn} aria-label="Zoom in" className="p-1.5 rounded bg-surface hover:bg-brand-purple-800 text-white border border-border-subtle"><ZoomIn className="w-4 h-4" /></button>
              <button onClick={handleZoomOut} aria-label="Zoom out" className="p-1.5 rounded bg-surface hover:bg-brand-purple-800 text-white border border-border-subtle"><ZoomOut className="w-4 h-4" /></button>
              <button onClick={handleReset} aria-label="Reset map view" className="p-1.5 rounded bg-surface hover:bg-brand-purple-800 text-white border border-border-subtle"><RotateCcw className="w-4 h-4" /></button>
            </div>
          </div>

          <div className="flex-1 relative z-10 -mt-10">
            <ComposableMap projection="geoMercator" projectionConfig={{ scale: 1200, center: [80, 22] }} className="w-full h-full outline-none">
              <ZoomableGroup 
                zoom={position.zoom} 
                center={position.coordinates} 
                onMoveEnd={(pos) => setPosition({ coordinates: pos.coordinates as [number, number], zoom: pos.zoom })}
                filterZoomEvent={(e: any) => {
                  if (e.type === 'wheel') return e.ctrlKey || e.metaKey;
                  return true;
                }}
              >
                {/* Glowing Background Glow for India */}
                <Marker coordinates={[80, 22]}>
                   <circle r={250} fill="url(#indiaGlow)" opacity={0.4} pointerEvents="none" />
                </Marker>
                <defs>
                   <radialGradient id="indiaGlow">
                     <stop offset="0%" stopColor="#da1a84" stopOpacity="0.15" />
                     <stop offset="50%" stopColor="#502875" stopOpacity="0.05" />
                     <stop offset="100%" stopColor="#000000" stopOpacity="0" />
                   </radialGradient>
                </defs>

                <Geographies geography={geoUrl}>
                  {({ geographies }) =>
                    geographies.map((geo) => {
                      if (geo.id !== "356") return null;
                      return (
                        <GeoPath
                          key={geo.rsmKey}
                          geography={geo}
                          fill="#16151a"
                          stroke="#da1a84"
                          strokeOpacity={0.3}
                          strokeWidth={1.5 / position.zoom}
                          style={{
                            default: { outline: "none", filter: "drop-shadow(0 0 10px rgba(218,26,132,0.2))" },
                            hover: { outline: "none", fill: "#1e1d24", filter: "drop-shadow(0 0 15px rgba(218,26,132,0.4))" },
                            pressed: { outline: "none" },
                          }}
                        />
                      )
                    })
                  }
                </Geographies>

                {/* Network Arcs */}
                {cityData.map((city, idx) => {
                   if (city.name === 'Bangalore' || city.name === 'Bengaluru') return null; // Don't draw line to self
                   const hqCoords = CITY_DATA['Bangalore'].coords;
                   // Only draw arcs for cities with active deals to show "revenue flow"
                   if (city.active === 0) return null;
                   
                   const health = getHealthColor(city.active);
                   const maxVal = cityData[0]?.leads || 1;
                   const strokeW = Math.max(0.5, (city.leads / maxVal) * 4);

                   return (
                     <GeoLine
                       key={`line-${city.name}`}
                       from={hqCoords}
                       to={city.coords}
                       stroke={health.fill}
                       strokeWidth={strokeW / position.zoom}
                       strokeOpacity={0.4}
                       strokeLinecap="round"
                       style={{ outline: "none", filter: `drop-shadow(0 0 6px ${health.glow})` }}
                     />
                   );
                })}

                {cityData.map((city, idx) => {
                  const visualBaseRadius = Math.max(5, (city.leads / maxLeads) * 12); 
                  const scaledSize = visualBaseRadius / position.zoom;
                  const textOffset = scaledSize + (14 / position.zoom);
                  const health = getHealthColor(city.active);
                  const isSelected = city.name === selectedCity;
                  const isTop5 = idx < 5;
                  const shouldShowData = isTop5 || isSelected;

                  return (
                    <Marker 
                      key={city.name} 
                      coordinates={city.coords}
                      onClick={() => handleCityClick(city.name, city.coords)}
                      onMouseEnter={() => setTooltipContent(`${city.name}: ${city.leads.toLocaleString('en-IN')} leads (${city.active.toFixed(1)}% active)`)}
                      onMouseLeave={() => setTooltipContent("")}
                    >
                      <g className="cursor-pointer group">
                        <circle 
                          r={scaledSize * 2.5} 
                          fill={health.fill} 
                          fillOpacity={0.15}
                          className={clsx(isSelected ? "animate-ping" : "", "pointer-events-none")}
                        />
                        <circle 
                          r={scaledSize * 1.5} 
                          fill={health.fill} 
                          fillOpacity={0.25}
                          className="pointer-events-none"
                        />
                        <circle 
                          r={scaledSize} 
                          fill={health.fill} 
                          fillOpacity={isSelected ? 1 : 0.9}
                          stroke="#ffffff"
                          strokeWidth={isSelected ? (3 / position.zoom) : (1.5 / position.zoom)}
                          className="group-hover:fill-opacity-100 transition-all"
                          style={{ filter: `drop-shadow(0 0 ${isSelected ? '12px' : '8px'} ${health.glow})` }}
                        />
                        <circle 
                          r={scaledSize / 2.5} 
                          fill="#ffffff" 
                          className="pointer-events-none"
                        />
                        {shouldShowData && position.zoom >= 1 && (
                          <g transform={`translate(${scaledSize + 4/position.zoom}, ${-scaledSize - 4/position.zoom}) scale(${1 / position.zoom})`} style={{ pointerEvents: 'none' }}>
                            <rect 
                              x="0" y="-22" 
                              width={city.name.length > 8 ? "95" : "75"} height="34" 
                              rx="6" 
                              fill="#16151a" 
                              fillOpacity="0.85"
                              stroke={health.fill}
                              strokeOpacity="0.5"
                              strokeWidth="1.5"
                              filter="drop-shadow(0px 6px 16px rgba(0,0,0,0.9))"
                            />
                            <text x="8" y="-7" fill="#ffffff" fontSize="10px" fontWeight="bold" fontFamily="Inter, system-ui, sans-serif">
                              {city.name}
                            </text>
                            <text x="8" y="7" fill={health.fill} fontSize="12px" fontWeight="900" fontFamily="Inter, system-ui, sans-serif">
                              {fmt(city.leads)}
                            </text>
                          </g>
                        )}
                        {!shouldShowData && position.zoom >= 1.5 && (
                          <text 
                            textAnchor="middle" 
                            y={-textOffset} 
                            style={{ 
                              fontFamily: "Inter, system-ui, sans-serif", 
                              fill: "#ffffff", 
                              fontSize: `${11 / position.zoom}px`,
                              fontWeight: 800,
                              pointerEvents: "none",
                              filter: "drop-shadow(0px 2px 8px rgba(0,0,0,0.9))"
                            }}
                          >
                            {city.state}
                          </text>
                        )}
                      </g>
                    </Marker>
                  );
                })}
              </ZoomableGroup>
            </ComposableMap>

            {tooltipContent && (
              <div className="absolute top-4 right-4 glass-card px-3 py-2 text-xs font-bold text-white pointer-events-none shadow-[0_0_20px_rgba(255,255,255,0.1)] border-white/20">
                {tooltipContent}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel: City Dossier OR Top Nodes */}
        <div className="glass-panel p-4 sm:p-6 xl:col-span-1 flex flex-col min-h-[420px] sm:min-h-[500px] max-h-[600px] overflow-y-auto no-scrollbar">
          {selectedCity && dossierData ? (
            <div className="flex flex-col h-full animate-in fade-in zoom-in duration-300">
              <div className="flex items-center justify-between mb-6">
                 <div>
                   <h2 className="text-2xl font-black text-white">{dossierData.name}</h2>
                   <span className="text-[10px] uppercase font-bold text-brand-purple-400 bg-brand-purple-900/30 px-2 py-0.5 rounded border border-brand-purple-500/30 tracking-wider inline-block mt-1">
                     {dossierData.state}
                   </span>
                 </div>
                 <button onClick={() => setSelectedCity(null)} className="text-xs text-text-secondary hover:text-white underline">Clear</button>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-surface/50 p-4 rounded-lg border border-border-subtle">
                  <p className="text-[10px] text-text-secondary uppercase">Total Leads</p>
                  <p className="text-xl font-bold text-white mt-1">{dossierData.total.toLocaleString('en-IN')}</p>
                </div>
                <div className={clsx("p-4 rounded-lg border", getHealthColor(dossierData.activeRate).bg, getHealthColor(dossierData.activeRate).border)}>
                  <p className="text-[10px] text-text-secondary uppercase">Active Deals</p>
                  <p className={clsx("text-xl font-bold mt-1", getHealthColor(dossierData.activeRate).text)}>
                    {dossierData.active.toLocaleString('en-IN')} <span className="text-sm font-normal">({dossierData.activeRate.toFixed(1)}%)</span>
                  </p>
                </div>
              </div>

              <h3 className="text-sm font-semibold uppercase tracking-wider text-white mb-4 flex items-center gap-2">
                <Crosshair className="w-4 h-4 text-brand-pink-500"/>
                Top Local BDs
              </h3>

              <div className="flex flex-col gap-3 flex-1">
                {dossierData.leaderboard.length === 0 && (
                  <p className="text-sm text-text-secondary italic">No active BDs mapped in this city.</p>
                )}
                {dossierData.leaderboard.map((bd, i) => (
                  <div key={bd.owner} className="flex items-center justify-between p-3 bg-surface/30 rounded-lg border border-border-subtle hover:border-brand-pink-500/30 transition-colors">
                     <div className="flex items-center gap-3">
                        <span className="text-lg font-black text-text-secondary w-4 text-right">#{i+1}</span>
                        <div>
                          <p className="text-sm font-bold text-white">{bd.owner}</p>
                          <p className="text-[10px] text-text-secondary uppercase">{bd.band}</p>
                        </div>
                     </div>
                     <div className="text-right">
                        <p className={clsx("text-sm font-bold", getHealthColor(bd.active).text)}>{bd.active.toFixed(0)}% Act</p>
                        <p className="text-[10px] text-text-secondary">BPS: {Math.round(bd.bps?.score || 0)}</p>
                     </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col h-full animate-in fade-in duration-300">
               <div className="flex items-center justify-between mb-6">
                 <div className="flex items-center gap-2">
                   <h2 className="text-sm font-semibold uppercase tracking-wider text-white">Top Data Nodes</h2>
                   <CsvButton
                     base="geography-cities"
                     filters={filters}
                     columns={[
                       { key: 'name', label: 'City' },
                       { key: 'state', label: 'State' },
                       { key: 'leads', label: 'Leads' },
                       { key: 'activeCount', label: 'Active leads' },
                       { key: 'active', label: 'Active %', format: (r: any) => (r.active != null ? r.active.toFixed(1) : '') },
                     ]}
                     rows={cityData}
                   />
                 </div>
                 {unmapped > 0 && (
                   <span className="text-[10px] text-text-secondary flex items-center gap-1 bg-surface px-2 py-1 rounded-full border border-border-subtle">
                     <MapPin className="w-3 h-3 text-brand-pink-500" />
                     {unmapped} unmapped
                   </span>
                 )}
               </div>
               
               <div className="text-center p-6 mb-4 bg-brand-purple-900/10 border border-brand-purple-500/20 rounded-xl">
                  <p className="text-sm text-brand-purple-200">Select a city node on the map to view its detailed Performance Dossier.</p>
               </div>

               <div className="flex flex-col gap-2 flex-1 overflow-y-auto no-scrollbar pr-2">
                 {cityData.slice(0, 10).map((c) => {
                   const health = getHealthColor(c.active);
                   return (
                     <button 
                       key={c.name}
                       onClick={() => handleCityClick(c.name, c.coords)}
                       className="flex flex-col gap-1.5 p-3 rounded-lg border border-transparent hover:border-brand-pink-500/30 hover:bg-brand-pink-500/10 transition-colors text-left group relative overflow-hidden"
                     >
                       <div className="absolute top-0 right-0 p-1 opacity-10 group-hover:opacity-20 transition-opacity">
                         <span className="text-4xl font-black italic">{c.state}</span>
                       </div>
                       
                       <div className="flex items-center justify-between text-sm w-full relative z-10">
                         <div className="flex items-center gap-2">
                           <span className="text-white font-medium group-hover:text-brand-pink-400 transition-colors">{c.name}</span>
                           <span className="text-[9px] uppercase font-bold text-brand-purple-400 bg-brand-purple-900/30 px-1.5 py-0.5 rounded border border-brand-purple-500/30">{c.state}</span>
                         </div>
                         <span className="text-white font-bold">{c.leads.toLocaleString('en-IN')} leads</span>
                       </div>
                       <div className="w-full h-1.5 bg-surface rounded-full overflow-hidden relative z-10 mt-1">
                         <div 
                           className={clsx("h-full rounded-full transition-colors", health.bg.replace('/10', ''), "shadow-[0_0_8px_rgba(255,255,255,0.2)]")}
                           style={{ width: `${(c.leads / maxLeads) * 100}%`, backgroundColor: health.fill }}
                         />
                       </div>
                       <div className="flex justify-between text-[10px] text-text-secondary uppercase tracking-wider w-full mt-1 relative z-10">
                         <span>Leads</span>
                         <span className={clsx("font-bold", health.text)}>{c.active.toFixed(1)}% Active</span>
                       </div>
                     </button>
                   );
                 })}
                 {cityData.length === 0 && (
                   <div className="text-sm text-text-secondary text-center py-8">No valid city nodes found.</div>
                 )}
               </div>
            </div>
          )}
        </div>
      </div>

      {/* P2-7 — state-level roll-up. City data is sparse, so a state table is the
          honest aggregation; a true state choropleth is noted as a follow-up. */}
      {stateData.length > 0 && (
        <div className="glass-panel p-4 sm:p-6 mt-4 sm:mt-6 relative z-10">
          <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-white flex items-center gap-2">
              <MapPin className="w-4 h-4 text-brand-pink-400" /> By State (mapped cities)
            </h2>
            <CsvButton
              base="geography-by-state"
              filters={filters}
              columns={[
                { key: 'state', label: 'State' },
                { key: 'leads', label: 'Leads' },
                { key: 'activeCount', label: 'Active leads' },
              ]}
              rows={stateData}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[420px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-widest text-text-secondary border-b border-border-subtle">
                  <th className="text-left py-2 pr-4 font-bold">State</th>
                  <th className="text-right py-2 px-4 font-bold">Leads</th>
                  <th className="text-right py-2 pl-4 font-bold">Active leads</th>
                </tr>
              </thead>
              <tbody>
                {stateData.map(s => (
                  <tr key={s.state} className="border-b border-border-subtle/40 hover:bg-surface/30 transition-colors">
                    <td className="py-2.5 pr-4 text-white font-bold">{s.state}</td>
                    <td className="text-right py-2.5 px-4 text-text-secondary tabular-nums">{s.leads.toLocaleString()}</td>
                    <td className="text-right py-2.5 pl-4 text-emerald-400 tabular-nums">{s.activeCount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[10px] text-text-secondary italic leading-snug">
            Aggregated from mapped-city leads only. A geographic state choropleth is a planned follow-up (needs a state-level GeoJSON layer).
          </p>
        </div>
      )}
    </div>
  );
}
