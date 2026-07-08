"""Compute the small pre-aggregated summary.json from dashboard_data.json.

Mirrors src/lib/utils.ts definitions exactly (rates over ASSIGNED leads only).
Anonymizes the leaderboard to first-name-only (disambiguated with a last initial
on collisions) so no full names are sent to the LLM. Output is a few KB.

Usage:
  from build_summary import build_summary
  summary = build_summary(dashboard_data_dict)
  # or standalone:
  python build_summary.py dashboard_data.json summary.json
"""
import json, collections

CONT = {"Lead Contacted", "Under Discussion"}
ACT  = {"Under Discussion"}
DROP = {"Lead Dropped", "Lost Lead", "Junk Lead", "Not Qualified"}
WON  = {"Closure", "Won", "Signed", "Qualified (WON)"}


def clamp(v, lo=0, hi=100):
    return max(lo, min(hi, v))


def pctile(vals):
    idx = sorted(range(len(vals)), key=lambda i: vals[i])
    n = len(vals)
    pr = [0] * n
    for r, i in enumerate(idx):
        pr[i] = round((r / (n - 1)) * 100) if n > 1 else 50
    return pr


def rates(ls):
    assigned = [l for l in ls if l.get("owner")]
    a = len(assigned)
    c = sum(1 for l in assigned if l.get("status") in CONT)
    act = sum(1 for l in assigned if l.get("status") in ACT)
    d = sum(1 for l in assigned if l.get("status") in DROP)
    w = sum(1 for l in assigned if l.get("status") in WON)
    r1 = lambda x: round((x / a) * 100, 1) if a else 0
    return {"assigned": a, "contacted": c, "active": act, "dropped": d, "won": w,
            "contactRatePct": r1(c), "activeRatePct": r1(act), "dropRatePct": r1(d)}


def group_block(leads, field, keys):
    out = {}
    for k in keys:
        ls = [l for l in leads if (l.get(field) if l.get(field) is not None else "Unknown") == k]
        r = rates(ls)
        out[k] = {"leads": len(ls), "contactRatePct": r["contactRatePct"],
                  "activeRatePct": r["activeRatePct"], "dropRatePct": r["dropRatePct"]}
    return out


def anon_names(owners):
    first = {}
    for o in owners:
        first.setdefault(o.split()[0], []).append(o)
    alias = {}
    for fn, group in first.items():
        if len(group) == 1:
            alias[group[0]] = fn
        else:
            for o in group:
                p = o.split()
                alias[o] = fn + (" " + p[1][0] + "." if len(p) > 1 else "")
    return alias


def _round_map(m, nd=0):
    return {k: (round(v, nd) if isinstance(v, (int, float)) else v) for k, v in (m or {}).items()}


def deals_block(deals):
    """Compact aggregates from deals.json for the Ask-AI feed (real signings, TA fees,
    fiscal MTD/YTD, signing-probability, funnel, points-based BD ranking, upcoming)."""
    if not deals:
        return None
    t = deals.get("totals", {})
    mtd = deals.get("mtd", {}) or {}
    ytd = deals.get("ytd", {}) or {}
    rank = deals.get("ranking", {}) or {}
    out = {
        "totals": {"deals": t.get("deals"), "signed": t.get("signed"), "active": t.get("active"),
                   "dropped": t.get("dropped"), "signRatePct": t.get("signRatePct"),
                   "dropRatePct": t.get("dropRatePct"), "keysContracted": t.get("keysContracted")},
        "portfolio": deals.get("portfolio"),
        "byBrand": {b: {"deals": v.get("deals"), "signed": v.get("signed"), "keys": v.get("keys")}
                    for b, v in (deals.get("byBrand") or {}).items()},
        "fees": deals.get("fees"),
        "signingProbability": {k: v.get("count") for k, v in (deals.get("signingProbability") or {}).items()},
        "funnel": [{"stage": f.get("stage"), "count": f.get("count"), "type": f.get("type")}
                   for f in (deals.get("funnel") or [])],
        "mtd": {"period": mtd.get("period"),
                "signings": (mtd.get("signings") or {}),
                "collectionsApprox": (mtd.get("collections") or {}).get("amount")},
        "ytd": {"fyStart": ytd.get("fyStart"),
                "signings": (ytd.get("signings") or {}),
                "collectionsApprox": {"amount": (ytd.get("collections") or {}).get("amount"),
                                      "byBrand": (ytd.get("collections") or {}).get("byBrand")}},
        "ranking": {"meta": rank.get("meta"),
                    "bds": [{"bd": b.get("bd"), "region": b.get("region"), "rank": b.get("rank"),
                             "ytdAchievement": b.get("ytdAchievement"),
                             "achievementPct": b.get("achievementPct")}
                            for b in (rank.get("bds") or [])],
                    "regions": rank.get("regions")},
        "upcoming": [{"dealName": u.get("dealName"), "brand": u.get("brand"), "bd": u.get("bd"),
                      "region": u.get("region"), "type": u.get("type"),
                      "expectedDate": u.get("expectedDate"), "keys": u.get("keys")}
                     for u in (deals.get("upcoming") or [])],
        "notes": "Signings=MA Signed (won). Collections attributed to signing date (no per-payment date); treat as approximate. Spark counted at LOI.",
    }
    return out


def proposals_block(proposals):
    """Compact aggregates from proposals.json (pre-deal dept-approval funnel)."""
    if not proposals:
        return None
    return {
        "totals": proposals.get("totals"),
        "byDeptApproval": proposals.get("byDeptApproval"),
        "byBrand": proposals.get("byBrand"),
        "byModel": proposals.get("byModel"),
        "notes": "Proposals = Awaiting_BusinessApproval module (Leads -> Proposals -> Deals -> Signings). approvalRatePct = approved/(approved+rejected).",
    }


def build_summary(d, deals=None, proposals=None):
    leads = d["leads"]; bds = d.get("bds", {}); weights = d["weights"]
    total = len(leads)
    assigned_all = [l for l in leads if l.get("owner")]
    ov = rates(leads)

    byo = collections.defaultdict(list)
    for l in leads:
        if l.get("owner"):
            byo[l["owner"]].append(l)
    owners = list(byo.keys())
    ns = [len(byo[o]) for o in owners]
    conns = [((bds.get(o) or {}).get("zoom") or {}).get("conn", 0) or 0 for o in owners]
    Lv = pctile(ns); Cav = pctile(conns)
    alias = anon_names(owners)
    lb = []
    for i, o in enumerate(owners):
        r = rates(byo[o]); bd = bds.get(o) or {}; q = bd.get("q")
        if q:
            Q = q["overall"] * 10; Cmp = q["brand_alignment"] * 10
            Cv = clamp(50 + r["activeRatePct"] * 2.2 + (r["contactRatePct"] - 40) * 0.25 - max(0, r["dropRatePct"] - 10) * 1.1)
            score = weights["Q"] * Q + weights["Cv"] * Cv + weights["Cmp"] * Cmp + weights["Lv"] * Lv[i] + weights["Cav"] * Cav[i]
            band = "Top performer" if score >= 72 else "Strong" if score >= 63 else "Developing" if score >= 54 else "Priority coaching"
        else:
            score = None; band = "Pending review"
        z = bd.get("zoom") or {}
        lb.append({"id": alias[o], "leads": len(byo[o]),
                   "contactRatePct": r["contactRatePct"], "activeRatePct": r["activeRatePct"], "dropRatePct": r["dropRatePct"],
                   "score": round(score, 1) if score is not None else None, "band": band,
                   "zoom": {"out": z.get("out", 0) or 0, "conn": z.get("conn", 0) or 0, "rec": z.get("rec", 0) or 0,
                            "connectRatePct": z.get("connect_rate") if z.get("connect_rate") is not None else 0}})
    lb.sort(key=lambda x: (x["score"] is not None, x["score"] or 0), reverse=True)

    tm = collections.defaultdict(lambda: {"leads": 0, "active": 0, "dropped": 0})
    for l in leads:
        mo = (l.get("dt") or "")[:7]
        if not mo:
            continue
        tm[mo]["leads"] += 1
        if l.get("status") in ACT: tm[mo]["active"] += 1
        if l.get("status") in DROP: tm[mo]["dropped"] += 1
    trend = [{"month": m, **tm[m]} for m in sorted(tm)]

    sc = collections.Counter((l.get("status") if l.get("status") is not None else "null") for l in leads)
    byStatus = {k: sc.get(k, 0) for k in
                ["New Leads", "Lead Contacted", "Under Discussion", "Lead Dropped", "null"]}

    # Leads by source — short-key counts {l/c/a/d}. Prefer the aggregate the
    # pipeline already put in the feed; otherwise compute from the raw leads.
    leadsBySource = d.get("leadsBySource")
    if not leadsBySource:
        leadsBySource = {}
        for l in leads:
            src = (l.get("source") or "Unknown") or "Unknown"
            b = leadsBySource.setdefault(src, {"l": 0, "c": 0, "a": 0, "d": 0})
            b["l"] += 1
            stt = l.get("status")
            if stt in CONT: b["c"] += 1
            if stt in ACT:  b["a"] += 1
            if stt in DROP: b["d"] += 1

    # Drop-reason counts — pass through the feed aggregate, else recompute.
    dropReasons = d.get("dropReasons")
    if not dropReasons:
        dropReasons = {}
        for l in leads:
            if l.get("status") in DROP:
                r = (l.get("dropReason") or "").strip() or "Unspecified"
                dropReasons[r] = dropReasons.get(r, 0) + 1

    return {
        "generated": d.get("generated"),
        "totals": {"leads": total, "assigned": len(assigned_all), "unassigned": total - len(assigned_all)},
        "overall": {"contacted": ov["contacted"], "active": ov["active"], "dropped": ov["dropped"],
                    "contactRatePct": ov["contactRatePct"], "activeRatePct": ov["activeRatePct"], "dropRatePct": ov["dropRatePct"]},
        "byBrand": group_block(leads, "brand", ["Olive", "Spark", "Open Hotels"]),
        "byRegion": group_block(leads, "region", ["North", "South", "West", "East", "Central", "Northeast", "Unknown"]),
        "byTier": group_block(leads, "tier", ["Tier 1", "Tier 2", "Tier 3", "Unknown"]),
        "byStatus": byStatus,
        "leadsBySource": leadsBySource,
        "dropReasons": dropReasons,
        "trend": trend,
        "leaderboard": lb,
        "deals": deals_block(deals),
        "proposals": proposals_block(proposals),
        "notes": {"revenue": "Lead-side $ are estimates = leadCount x 12500, not booked revenue.",
                  "won": "Closed-won deals, TA fees, fiscal MTD/YTD signings & collections, signing "
                         "probability, the points-based BD ranking and upcoming signings are in the "
                         "'deals' block. The pre-deal department-approval funnel is in 'proposals'. "
                         "Collections are attributed to signing date (no per-payment date) and are approximate."},
    }


if __name__ == "__main__":
    import sys, os
    src = sys.argv[1] if len(sys.argv) > 1 else "dashboard_data.json"
    out = sys.argv[2] if len(sys.argv) > 2 else "summary.json"
    data = json.load(open(src))
    base = os.path.dirname(os.path.abspath(src)) or "."
    def _load(name):
        p = os.path.join(base, name)
        return json.load(open(p)) if os.path.exists(p) else None
    deals = _load("deals.json")
    proposals = _load("proposals.json")
    json.dump(build_summary(data, deals, proposals), open(out, "w"), separators=(",", ":"), default=str)
    print("wrote", out)
