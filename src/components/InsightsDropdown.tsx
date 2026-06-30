'use client';

import { useState, useRef, useEffect } from 'react';
import { Lightbulb, ChevronDown, ChevronRight, Briefcase } from 'lucide-react';
import clsx from 'clsx';
import { InsightModal, InsightData } from './InsightModal';

type InsightCategory = {
  name: string;
  insights: InsightData[];
};

const CATEGORIES: InsightCategory[] = [
  {
    name: "Pipeline Health",
    insights: [
      {
        id: "pipeline-bottleneck",
        title: "Severe Bottleneck at 'Under Discussion' Stage",
        implication: "We have 1,420 leads (38% of active pipeline) stalled in the 'Under Discussion' phase for >14 days. Quantitative analysis shows 65% of these are awaiting Business Head approval for custom pricing deviations, indicating a structural flaw in our pricing matrix.",
        evidenceType: 'area-chart',
        evidenceData: {
          xAxis: 'stage',
          areas: [{ key: 'count', color: '#da1a84' }],
          alert: "Massive 71% drop-off at 'Under Discussion'",
          data: [
            { stage: 'Logged', count: 3800 },
            { stage: 'Contacted', count: 3200 },
            { stage: 'Under Discussion', count: 1420 },
            { stage: 'Approval', count: 400 },
            { stage: 'Active', count: 310 },
          ]
        }
      },
      {
        id: "tier-conversion",
        title: "Tier 1 Conversion Velocity is 36% Faster",
        implication: "Tier 1 properties convert to Active Deals in 14 days on average vs 22 days for Tier 2. Deal velocity is significantly higher in Tier 1 corporate hubs. We should immediately reallocate 15% of our outbound SDR capacity to focus exclusively on Tier 1 inbound.",
        evidenceType: 'bar-chart',
        evidenceData: {
          xAxis: 'tier',
          bars: [
            { key: 'Days to Convert', color: '#502875' }
          ],
          data: [
            { tier: 'Tier 1', 'Days to Convert': 14 },
            { tier: 'Tier 2', 'Days to Convert': 22 },
            { tier: 'Tier 3', 'Days to Convert': 28 },
          ]
        }
      },
      {
        id: "first-call-drop",
        title: "Increasing Immediate Drop-off Post Discovery Call",
        implication: "Currently, 22% of leads drop off immediately after the initial discovery call. QA compliance models indicate this is heavily correlated with reps failing to set mutually agreed next steps before terminating the call.",
        evidenceType: 'line-chart',
        evidenceData: {
          xAxis: 'month',
          lines: [{ key: 'Drop Rate %', color: '#da1a84' }],
          data: [
            { month: 'Jan', 'Drop Rate %': 15 },
            { month: 'Feb', 'Drop Rate %': 18 },
            { month: 'Mar', 'Drop Rate %': 22 },
          ]
        }
      }
    ]
  },
  {
    name: "Team Performance",
    insights: [
      {
        id: "performer-stats",
        title: "Quality Over Volume: True Top Performers",
        implication: "Harshit S. is leading with a 92/100 Balanced Score. While Arjun K. has higher absolute dial volume, Harshit's rigorous adherence to the Quality Assurance rubric (94%) yields a 14% higher net revenue expectation per lead assigned.",
        evidenceType: 'stat-cards',
        evidenceData: {
          cards: [
            { title: 'Harshit S.', subtitle: '94% QA Score', value: '92', suffix: '/100', icon: 'check', highlight: true },
            { title: 'Arjun K.', subtitle: '81% QA Score', value: '85', suffix: '/100', icon: 'chart', highlight: false }
          ]
        }
      },
      {
        id: "vol-vs-conv",
        title: "High Effort, Low Yield Outliers",
        implication: "Suresh P. and Vikram M. are exceeding 60 outbound dials per day, but their Active Deal conversion sits at a concerning 12% (vs team average of 24%). Immediate coaching intervention required on their closing mechanics.",
        evidenceType: 'data-table',
        evidenceData: {
          columns: ['Rep Name', 'Dials/Day', 'Conversion Rate'],
          rows: [
            [{value: 'Suresh P.'}, {value: '68'}, {value: '11%', color: 'text-brand-pink-500 font-bold'}],
            [{value: 'Vikram M.'}, {value: '62'}, {value: '13%', color: 'text-brand-pink-500 font-bold'}],
            [{value: 'Team Average'}, {value: '42'}, {value: '24%', color: 'text-emerald-400 font-bold'}]
          ]
        }
      },
      {
        id: "compliance-corr",
        title: "Script Adherence Drives 30% Lift in Win Rate",
        implication: "There is a massive statistical correlation between playbook compliance and revenue. Reps scoring >85% in pitch accuracy and script adherence have a 30% higher final win rate. Process adherence directly impacts the bottom line.",
        evidenceType: 'alert-box',
        evidenceData: {
          title: "High Correlation Detected",
          description: "Statistical modeling confirms that every 10% increase in script compliance yields a 4.2% compounding lift in final win rate."
        }
      }
    ]
  },
  {
    name: "Competitive Threats",
    insights: [
      {
        id: "spark-vs-olive",
        title: "Spark Volume Surge Masks Conversion Deficit",
        implication: "Spark's new 'Flash Sale' campaign in Tier 2 cities generated 42% of total inbound volume. However, Olive maintains a vastly superior Active Deal conversion rate due to higher enterprise intent.",
        evidenceType: 'bar-chart',
        evidenceData: {
          xAxis: 'tier',
          bars: [
            { key: 'Spark Volume', color: '#da1a84' },
            { key: 'Olive Volume', color: '#502875' }
          ],
          data: [
            { tier: 'Tier 1', 'Spark Volume': 120, 'Olive Volume': 340 },
            { tier: 'Tier 2', 'Spark Volume': 450, 'Olive Volume': 90 },
            { tier: 'Tier 3', 'Spark Volume': 80, 'Olive Volume': 40 },
          ]
        }
      },
      {
        id: "south-decline",
        title: "Deal Velocity Declining in the South Region",
        implication: "Bangalore saw a 15% WoW decline in deals reaching 'Awaiting Business Approval'. Intelligence indicates local competitors are undercutting our standard pricing by 10-15% in key tech parks.",
        evidenceType: 'area-chart',
        evidenceData: {
          xAxis: 'week',
          areas: [
            { key: 'Bangalore Leads', color: '#da1a84' },
            { key: 'Chennai Leads', color: '#502875' }
          ],
          data: [
            { week: 'W1', 'Bangalore Leads': 120, 'Chennai Leads': 80 },
            { week: 'W2', 'Bangalore Leads': 115, 'Chennai Leads': 82 },
            { week: 'W3', 'Bangalore Leads': 95, 'Chennai Leads': 75 },
            { week: 'W4 (Now)', 'Bangalore Leads': 78, 'Chennai Leads': 70 },
          ]
        }
      },
      {
        id: "pricing-loss",
        title: "Price Sensitivity is Rapidly Increasing",
        implication: "28% of closed-lost deals cite 'Pricing' as the primary reason, up from 18% last quarter. The market is becoming highly price-sensitive in the IT sector, signaling a need for a flexible pricing matrix.",
        evidenceType: 'line-chart',
        evidenceData: {
          xAxis: 'quarter',
          lines: [{ key: 'Lost to Pricing %', color: '#da1a84' }],
          data: [
            { quarter: 'Q1', 'Lost to Pricing %': 16 },
            { quarter: 'Q2', 'Lost to Pricing %': 18 },
            { quarter: 'Q3', 'Lost to Pricing %': 22 },
            { quarter: 'Q4', 'Lost to Pricing %': 28 },
          ]
        }
      }
    ]
  },
  {
    name: "Data Quality",
    insights: [
      {
        id: "data-health",
        title: "Critical Failure in Data Capture",
        implication: "18% of new leads lack 'City' assignments entirely. Furthermore, 4 BD reps have >50% of their calls flagged by our automated compliance system for 'Missing Next Steps'.",
        evidenceType: 'data-table',
        evidenceData: {
          columns: ['Rep Name', 'Missing City', 'No Next Steps'],
          rows: [
            [{value: 'Vikram S.'}, {value: '24%', color: 'text-brand-pink-500 font-bold'}, {value: '62%', color: 'text-brand-pink-500 font-bold'}],
            [{value: 'Divya C.'}, {value: '18%', color: 'text-orange-400 font-bold'}, {value: '55%', color: 'text-brand-pink-500 font-bold'}],
            [{value: 'Amit T.'}, {value: '15%', color: 'text-orange-400 font-bold'}, {value: '48%', color: 'text-orange-400 font-bold'}]
          ]
        }
      },
      {
        id: "missing-reqs",
        title: "Marketing Automation Blocked by Missing Data",
        implication: "Over 450 active leads currently have 'Requirement Type' set to 'Unknown'. This fundamentally prevents our automated nurturing campaigns from targeting them effectively.",
        evidenceType: 'alert-box',
        evidenceData: {
          title: "Revenue Operations Bottleneck",
          description: "450 leads equals roughly $2.2M in pipeline value that cannot be automatically nurtured due to missing fundamental data fields."
        }
      },
      {
        id: "sync-lag",
        title: "System Synchronization Delay Impacting Operations",
        implication: "We are experiencing a 4-hour delay during peak times (2PM - 5PM) in telephony transcriptions syncing back to the CRM, causing redundant data entry for the reps.",
        evidenceType: 'line-chart',
        evidenceData: {
          xAxis: 'time',
          lines: [{ key: 'Sync Delay (mins)', color: '#502875' }],
          data: [
            { time: '10 AM', 'Sync Delay (mins)': 15 },
            { time: '12 PM', 'Sync Delay (mins)': 45 },
            { time: '2 PM', 'Sync Delay (mins)': 120 },
            { time: '4 PM', 'Sync Delay (mins)': 240 },
          ]
        }
      }
    ]
  },
  {
    name: "Growth Opportunities",
    insights: [
      {
        id: "emerging-city",
        title: "Indore Shows Exponential Inbound Intent",
        implication: "Indore has seen a 300% surge in organic inbound inquiries over the last 60 days, driven by new tech parks opening up. We currently only have 1 BD rep covering this area. Resource deployment is required.",
        evidenceType: 'bar-chart',
        evidenceData: {
          xAxis: 'city',
          bars: [{ key: 'Inbound Growth %', color: '#da1a84' }],
          data: [
            { city: 'Indore', 'Inbound Growth %': 310 },
            { city: 'Jaipur', 'Inbound Growth %': 140 },
            { city: 'Kochi', 'Inbound Growth %': 95 },
          ]
        }
      },
      {
        id: "mid-size-corp",
        title: "Mid-size Corporate Segment is Highly Lucrative",
        implication: "Mid-size deals (50-200 seats) have a 40% shorter sales cycle than Enterprise deals and a 15% higher win rate against local competitors. Targeting this segment yields faster revenue recognition.",
        evidenceType: 'stat-cards',
        evidenceData: {
          cards: [
            { title: 'Mid-size', subtitle: 'Win Rate', value: '38', suffix: '%', icon: 'check', highlight: true },
            { title: 'Enterprise', subtitle: 'Win Rate', value: '23', suffix: '%', icon: 'chart', highlight: false }
          ]
        }
      },
      {
        id: "dev-band-potential",
        title: "Massive Untapped Potential in 'Developing' Band",
        implication: "If the 12 reps currently in the 'Developing' band increased their conversion rate by just 2% (to match the 'Strong' baseline), it would yield an additional 45 active deals per month.",
        evidenceType: 'alert-box',
        evidenceData: {
          title: "$8M Pipeline Unlock",
          description: "Moving the middle tier of reps up by a fraction of a percent yields exponential returns compared to over-indexing on top performers."
        }
      }
    ]
  }
];

export function InsightsDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedInsight, setSelectedInsight] = useState<InsightData | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<string[]>(['Pipeline Health']);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleCategory = (catName: string) => {
    setExpandedCategories(prev => 
      prev.includes(catName) ? prev.filter(c => c !== catName) : [...prev, catName]
    );
  };

  return (
    <>
      <div className="relative z-40" ref={dropdownRef}>
        <button 
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-4 py-2 bg-brand-pink-500/10 hover:bg-brand-pink-500/20 border border-brand-pink-500/30 rounded-lg text-sm font-bold text-brand-pink-400 transition-colors shadow-[0_0_15px_rgba(218,26,132,0.15)]"
        >
          <Lightbulb className="w-4 h-4" />
          Executive Insights
          <ChevronDown className={clsx("w-4 h-4 transition-transform", isOpen && "rotate-180")} />
        </button>

        {isOpen && (
          <div className="absolute right-0 mt-2 w-[450px] max-w-[calc(100vw-2rem)] glass-panel border border-brand-pink-500/30 shadow-[0_10px_40px_rgba(218,26,132,0.2)] rounded-xl overflow-hidden animate-in fade-in slide-in-from-top-2 flex flex-col max-h-[600px]">
            <div className="p-4 bg-brand-pink-500/10 border-b border-brand-pink-500/20 flex justify-between items-center shrink-0">
              <span className="text-xs font-bold uppercase tracking-wider text-brand-pink-400 flex items-center gap-1.5"><Briefcase className="w-3.5 h-3.5"/> Strategic Briefings</span>
              <span className="text-[10px] font-bold text-text-secondary bg-surface px-2 py-0.5 rounded-full border border-border-subtle">15 Data Points</span>
            </div>
            
            <div className="overflow-y-auto no-scrollbar flex-1 p-2 flex flex-col gap-2">
              {CATEGORIES.map((cat) => {
                const isExpanded = expandedCategories.includes(cat.name);
                return (
                  <div key={cat.name} className="border border-border-subtle rounded-lg overflow-hidden bg-surface/30">
                    <button
                      onClick={() => toggleCategory(cat.name)}
                      className="w-full flex items-center justify-between p-3 hover:bg-surface/50 transition-colors"
                    >
                      <span className="text-sm font-bold text-white">{cat.name}</span>
                      <ChevronRight className={clsx("w-4 h-4 text-text-secondary transition-transform", isExpanded && "rotate-90")} />
                    </button>
                    
                    {isExpanded && (
                      <div className="flex flex-col gap-1 p-2 bg-black/20 border-t border-border-subtle/50">
                        {cat.insights.map((item) => (
                          <button 
                            key={item.id}
                            className="p-3 rounded-lg cursor-pointer transition-colors border text-left bg-transparent border-transparent hover:bg-brand-purple-900/20 hover:border-brand-purple-500/30 group"
                            onClick={() => {
                              setSelectedInsight(item);
                              setIsOpen(false);
                            }}
                          >
                            <div className="flex items-start gap-2">
                              <span className="text-xs font-bold text-brand-purple-400 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">View &rarr;</span>
                              <p className="text-sm font-medium text-text-primary leading-tight group-hover:text-white transition-colors">{item.title}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <InsightModal insight={selectedInsight} onClose={() => setSelectedInsight(null)} />
    </>
  );
}
