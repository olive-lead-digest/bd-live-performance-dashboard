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
}

export interface Rates {
  n: number;
  contacted: number;
  active: number;
  dropped: number;
  contact: number;
  activeR: number;
  drop: number;
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
}

declare global {
  interface Window {
    DASH_DATA?: DashData;
  }
}
