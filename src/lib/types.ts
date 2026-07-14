export interface Lead {
  dt: string;
  state: string;
  region: string;
  city: string;
  brand: string;
  owner: string | null;
  status: string | null;
  prop: string;
  tier: string;
  cluster: string;
  ci: boolean;
}

export interface BD {
  reviewed: boolean;
  q?: {
    soft_skills: number;
    brand_alignment: number;
    pitch_clarity: number;
    sales_skill: number;
    conversion_skill: number;
    discovery_quality: number;
    objection_handling: number;
    closing_discipline: number;
    overall: number;
  };
  low?: boolean;
  cum?: number;
  zoom?: {
    out: number;
    conn: number;
    rec: number;
    avg: number;
    connect_rate: number;
  };
  strength?: string;
  risk?: string;
  insight?: string;
}

export interface DashData {
  generated: string;
  weights: {
    Q: number;
    Cv: number;
    Cmp: number;
    Lv: number;
    Cav: number;
  };
  dims: string[];
  leads: Lead[];
  bds: Record<string, BD>;
  deals?: any;
  // Proposals / department-approval stage (Zoho Awaiting_BusinessApproval).
  // The pre-deal, under-approval funnel entity between Leads and Deals.
  proposals?: Proposals;
  // NEW feed keys — may be undefined until the pipeline reruns; always guard.
  leadsBySource?: Record<string, { l: number; c: number; a: number; d: number }>;
  dropReasons?: Record<string, number>;
  // BD org map (regions -> head -> BDs, with zoom + email). Best-effort feed.
  org?: OrgMap;
}

// ---- BD org directory (bd_org.json) ----
export interface OrgBD {
  zohoName?: string;
  region?: string;
  regionHead?: string;
  isHead?: boolean;
  coverage?: string;
  zoom?: string;
  email?: string;
}

export interface OrgMap {
  generated?: string;
  note?: string;
  regionHeads?: Record<string, string>;
  regions?: Record<string, { head: string; bds: string[] }>;
  bds?: Record<string, OrgBD>;
}

export interface ApprovalDept {
  // NEW feed: required-subset counts (a proposal only needs an approval from a
  // department when that department is required for its brand/model).
  required: number;
  approved: number;
  rejected: number;
  pending: number;
}

export interface ArrOcc {
  avg: number | null;
  n: number;
}

export interface ArrOccSet {
  year1Arr: ArrOcc;
  year1Occ: ArrOcc;
  stabilisedArr: ArrOcc;
  stabilisedOcc: ArrOcc;
  landlordArr: ArrOcc;
  landlordOcc: ArrOcc;
}

export interface Proposals {
  generated: string;
  totals: {
    proposals: number;
    approved: number;
    rejected: number;
    pending: number;
    notRouted: number;
    approvalRatePct: number;
  };
  byDeptApproval: {
    salesRevenue: ApprovalDept;
    design: ApprovalDept;
    ops: ApprovalDept;
  };
  byBrand: Record<string, { proposals: number; approved: number; rejected: number; pending: number }>;
  byModel: Record<string, { proposals: number; approved: number; rejected: number; pending: number }>;
  arrOccupancy: ArrOccSet;
  // NEW feed: ARR / occupancy split by brand (Olive / Spark / Open Hotels).
  arrOccupancyByBrand?: Record<string, ArrOccSet>;
}

export interface SourceStat {
  l: number; // total leads
  c: number; // contacted
  a: number; // active
  d: number; // dropped
}

export interface Rates {
  n: number;
  contacted: number;
  active: number;
  dropped: number;
  won: number;
  contact: number;
  activeR: number;
  drop: number;
  wonR: number;
  contactCI: [number, number];
  activeCI: [number, number];
  dropCI: [number, number];
}

export interface BPS {
  Q: number;
  Cv: number;
  Cmp: number;
  Lv: number;
  Cav: number;
  /** Signings sub-score component (analyst correction — signings are the
   *  primary KPI, so they factor into the balanced score). 0 when no
   *  signings map is supplied to buildLeaderboard. */
  Sg?: number;
  score: number;
}

export interface LeaderboardRec {
  owner: string;
  n: number;
  contact: number;
  active: number;
  drop: number;
  activeCI: [number, number];
  dropCI: [number, number];
  contactCI: [number, number];
  reviewed: boolean;
  q?: BD['q'];
  low?: boolean;
  zoom: NonNullable<BD['zoom']>;
  cum?: number;
  bd: BD;
  conn: number;
  bps: BPS | null;
  band: string;
  /** MA-Signed + LOI-Signed count for this BD (from the deals feed). Surfaced
   *  on performance cards and folded into the balanced score. */
  signings?: number;
  /** P1-8: present in leads/deals data but NOT in the org roster (bd_org.json)
   *  — an ex-BD or test account. Excluded from band counts and QA percentages. */
  inactive?: boolean;
}

declare global {
  interface Window {
    DASH_DATA?: DashData;
  }
}
