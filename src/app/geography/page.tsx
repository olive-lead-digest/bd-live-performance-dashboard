'use client';

import { useDashboard } from '@/lib/DashboardContext';
import { calculateRates, groupCounts, buildLeaderboard, ESTIMATED_DEAL_VALUE } from '@/lib/utils';
import { useMemo, useState } from 'react';
import { ComposableMap, Geographies, Geography as GeoPath, ZoomableGroup, Marker, Line as GeoLine } from 'react-simple-maps';
import clsx from 'clsx';
import { MapPin, ZoomIn, ZoomOut, RotateCcw, Search, Crosshair, Users, Activity } from 'lucide-react';
import { ExecSummary, SummaryBullet } from '@/components/ExecSummary';

const geoUrl = "/world.json";
// Illustrative estimate only — leads carry no monetary amount (see utils.ts).
const AVG_DEAL_SIZE = ESTIMATED_DEAL_VALUE;

const formatCurrency = (num: number) => {
  if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(1) + 'k';
  return num.toString();
};

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
  const { filteredLeads, data, isLoading } = useDashboard();
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
    const validRegions = Object.keys(rCounts).filter(r => r && r !== '(none)' && r !== 'Other');
    
    return validRegions.map(r => {
      const leadsInRegion = searchFiltered.filter(l => l.region === r);
      const rates = calculateRates(leadsInRegion);
      return {
        name: r,
        total: leadsInRegion.length,
        pipelineValue: leadsInRegion.length * AVG_DEAL_SIZE,
        securedRevenue: rates.active * AVG_DEAL_SIZE,
        activeRate: rates.activeR,
        active: rates.active
      };
    }).sort((a,b) => b.pipelineValue - a.pipelineValue).slice(0, 4);
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
          pipelineValue: counts[city] * AVG_DEAL_SIZE,
          securedRevenue: rates.active * AVG_DEAL_SIZE,
          active: rates.activeR
        };
      })
      .sort((a, b) => b.pipelineValue - a.pipelineValue);
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
    if (topCity) b.push({ tone: 'up', text: `${topCity.name} is the top market with $${formatCurrency(topCity.securedRevenue)} secured (${topCity.active.toFixed(1)}% active).` });
    const topRegion = regionalData[0];
    if (topRegion) b.push({ tone: 'info', text: `${topRegion.name} leads all regions by pipeline at $${formatCurrency(topRegion.pipelineValue)}.` });
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
  const unmapped = searchFiltered.filter(l => !l.city || l.city === 'Other' || !CITY_DATA[l.city]).length;

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
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
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
                    <span className="text-xl font-black text-white">${formatCurrency(r.securedRevenue)}</span>
                    <span className="text-[10px] text-text-secondary uppercase">Secured Rev</span>
                  </div>
                  <span className={clsx("text-sm font-bold px-2 py-0.5 rounded-md", health.bg, health.text)}>{r.activeRate.toFixed(1)}% Act</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Map */}
        <div className="glass-panel p-6 xl:col-span-2 min-h-[500px] flex flex-col relative overflow-hidden group border-brand-purple-500/20 shadow-[0_0_30px_rgba(80,40,117,0.15)]">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-brand-purple-900/30 via-transparent to-transparent opacity-60" />
          
          <div className="flex items-center justify-between z-10 relative mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-white">Conversion Health Map</h2>
            <div className="flex items-center gap-2">
              <button onClick={handleZoomIn} className="p-1.5 rounded bg-surface hover:bg-brand-purple-800 text-white border border-border-subtle"><ZoomIn className="w-4 h-4" /></button>
              <button onClick={handleZoomOut} className="p-1.5 rounded bg-surface hover:bg-brand-purple-800 text-white border border-border-subtle"><ZoomOut className="w-4 h-4" /></button>
              <button onClick={handleReset} className="p-1.5 rounded bg-surface hover:bg-brand-purple-800 text-white border border-border-subtle"><RotateCcw className="w-4 h-4" /></button>
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
                   const maxVal = cityData[0]?.pipelineValue || 1;
                   const strokeW = Math.max(0.5, (city.pipelineValue / maxVal) * 4);

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
                      onMouseEnter={() => setTooltipContent(`${city.name}: $${formatCurrency(city.securedRevenue)} Secured (${city.active.toFixed(1)}%)`)}
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
                              ${formatCurrency(city.securedRevenue)}
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
        <div className="glass-panel p-6 xl:col-span-1 flex flex-col min-h-[500px] max-h-[600px] overflow-y-auto no-scrollbar">
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
                  <p className="text-[10px] text-text-secondary uppercase">Pipeline Value</p>
                  <p className="text-xl font-bold text-white mt-1">${formatCurrency(dossierData.total * AVG_DEAL_SIZE)}</p>
                </div>
                <div className={clsx("p-4 rounded-lg border", getHealthColor(dossierData.activeRate).bg, getHealthColor(dossierData.activeRate).border)}>
                  <p className="text-[10px] text-text-secondary uppercase">Secured Revenue</p>
                  <p className={clsx("text-xl font-bold mt-1", getHealthColor(dossierData.activeRate).text)}>
                    ${formatCurrency(dossierData.active * AVG_DEAL_SIZE)} <span className="text-sm font-normal">({dossierData.activeRate.toFixed(1)}%)</span>
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
                 <h2 className="text-sm font-semibold uppercase tracking-wider text-white">Top Data Nodes</h2>
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
                         <span className="text-white font-bold">${formatCurrency(c.pipelineValue)}</span>
                       </div>
                       <div className="w-full h-1.5 bg-surface rounded-full overflow-hidden relative z-10 mt-1">
                         <div 
                           className={clsx("h-full rounded-full transition-colors", health.bg.replace('/10', ''), "shadow-[0_0_8px_rgba(255,255,255,0.2)]")}
                           style={{ width: `${(c.leads / maxLeads) * 100}%`, backgroundColor: health.fill }}
                         />
                       </div>
                       <div className="flex justify-between text-[10px] text-text-secondary uppercase tracking-wider w-full mt-1 relative z-10">
                         <span>Pipeline Value</span>
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
    </div>
  );
}
