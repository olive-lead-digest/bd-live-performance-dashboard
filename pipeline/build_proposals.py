#!/usr/bin/env python3
"""Build the Olive Hospitality "proposals" feed (proposals.json) for the BD dashboard.

Proposals are the PRE-deal, under-approval entity in the BD funnel:
    Leads -> PROPOSALS (dept approvals) -> Deals -> Signings.
When a lead qualifies a BD creates a Proposal; it needs department approvals
(Sales/Revenue, Design, Ops) depending on brand/model. Once all required
approvals are received a Deal is auto-created at stage "Business Approval Received".

In Zoho this is the custom module **Awaiting_BusinessApproval** (module_name
CustomModule15; singular label "Proposal"). Verified via getFields on the live org.

analyst P1 — each department's approval stats are computed ONLY over proposals whose
Brand+Model REQUIRES that department. Emit per-dept {required, approved, rejected, pending}.
analyst P2 — emit byBrand + byModel and ARR/occupancy averages split BY BRAND
(arrOccupancyByBrand), keeping the 0-100 occupancy clamp.

Usage:
  python build_proposals.py                 # LIVE: fetch from Zoho, write proposals.json
  python build_proposals.py out.json        # write to a specific path
  # or import build_proposals(records) with a list of Zoho dicts (used by tests).
"""
import os, sys, json, re, datetime
from collections import defaultdict

try:
    import requests  # only needed for the live fetch path
except Exception:  # pragma: no cover
    requests = None

ZOHO_CLIENT_ID     = os.getenv("ZOHO_CLIENT_ID", "")
ZOHO_CLIENT_SECRET = os.getenv("ZOHO_CLIENT_SECRET", "")
ZOHO_REFRESH_TOKEN = os.getenv("ZOHO_REFRESH_TOKEN", "")

MODULE = "Awaiting_BusinessApproval"

PROPOSAL_FIELDS = (
    "Final_Decision,Approval_Status,Approval_Status1,Approval_Status2,"
    "Brand,Sub_Brand,Arr_1st_Year,Arr_1st_Year_Occ,Stabilised_Arr,Stabilised_Occ,"
    "Number_1,landlord_expected_Occupancy,Record_Status__s"
)

APPROVED = "approved"
REJECTED = "rejected"
PENDING  = "pending"   # "To be approved" / "To Be Approved"
NONE     = "none"      # "-None-" / null (not applicable / not routed)

# --- analyst P1: which department approval is REQUIRED per (Brand, Model) ------
REQUIRED = {
    "salesRevenue": {("Spark", "Management"), ("Olive", "Management"),
                     ("Open", "Management"), ("Olive", "Franchise")},
    "design":       {("Spark", "Management"), ("Olive", "Management"),
                     ("Olive", "Franchise")},
    "ops":          {("Open", "Franchise")},
}
DEPT_FIELD = {"salesRevenue": "Approval_Status2",
              "design": "Approval_Status", "ops": "Approval_Status1"}

# analyst P2 — proposals store 'Open' for Open Hotels; dashboard labels it 'Open Hotels'.
BRAND_OUT = {"Olive": "Olive", "Spark": "Spark", "Open": "Open Hotels"}

ARR_METRICS = ("year1Arr", "year1Occ", "stabilisedArr", "stabilisedOcc",
               "landlordArr", "landlordOcc")
ARR_FIELD = {"year1Arr": "Arr_1st_Year", "year1Occ": "Arr_1st_Year_Occ",
             "stabilisedArr": "Stabilised_Arr", "stabilisedOcc": "Stabilised_Occ",
             "landlordArr": "Number_1", "landlordOcc": "landlord_expected_Occupancy"}
OCC_METRICS = {"year1Occ", "stabilisedOcc", "landlordOcc"}


def _num(v):
    if v is None:
        return None
    if isinstance(v, dict):
        v = v.get("value")
    if v in ("", None):
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        m = re.search(r"-?\d+(?:\.\d+)?", str(v).replace(",", ""))
        return float(m.group()) if m else None


def approval_bucket(v):
    s = str(v or "").strip().lower()
    if s in ("", "-none-", "none"):
        return NONE
    if s == "approved":
        return APPROVED
    if s == "rejected":
        return REJECTED
    if "approv" in s:
        return PENDING
    return NONE


def norm_brand(b):
    b = str(b or "").strip()
    if not b or b == "-None-":
        return "Unspecified"
    bl = b.lower()
    if "olive" in bl:
        return "Olive"
    if "open" in bl:
        return "Open"
    if "spark" in bl:
        return "Spark"
    return b.title()


def norm_model(m):
    m = str(m or "").strip()
    if not m or m == "-None-":
        return "Unspecified"
    return m.title()


def _avg(values, lo=None, hi=None):
    xs = [x for x in values if x is not None]
    if lo is not None:
        xs = [x for x in xs if x >= lo]
    if hi is not None:
        xs = [x for x in xs if x <= hi]
    if not xs:
        return {"avg": None, "n": 0}
    return {"avg": round(sum(xs) / len(xs), 2), "n": len(xs)}


def _arr_block(acc):
    out = {}
    for m in ARR_METRICS:
        out[m] = _avg(acc[m], lo=0, hi=100) if m in OCC_METRICS else _avg(acc[m], lo=0)
    return out


def build_proposals(records, generated=None):
    generated = generated or datetime.datetime.now().isoformat(timespec="seconds")

    approved = rejected = pending = none_state = 0
    dept = {d: {"required": 0, "approved": 0, "rejected": 0} for d in REQUIRED}
    by_brand = defaultdict(lambda: {"proposals": 0, "approved": 0, "rejected": 0, "pending": 0})
    by_model = defaultdict(lambda: {"proposals": 0, "approved": 0, "rejected": 0, "pending": 0})
    acc = {m: [] for m in ARR_METRICS}
    acc_brand = {bk: {m: [] for m in ARR_METRICS} for bk in ("Olive", "Spark", "Open Hotels")}

    total = 0
    for r in records:
        if str(r.get("Record_Status__s") or "").strip().lower() == "trash":
            continue
        total += 1

        final = approval_bucket(r.get("Final_Decision"))
        if final == APPROVED:
            approved += 1
        elif final == REJECTED:
            rejected += 1
        elif final == PENDING:
            pending += 1
        else:
            none_state += 1

        brand = norm_brand(r.get("Brand"))
        model = norm_model(r.get("Sub_Brand"))
        bm = (brand, model)

        for d, reqset in REQUIRED.items():
            if bm in reqset:
                dept[d]["required"] += 1
                b = approval_bucket(r.get(DEPT_FIELD[d]))
                if b == APPROVED:
                    dept[d]["approved"] += 1
                elif b == REJECTED:
                    dept[d]["rejected"] += 1

        for bucket, key in ((by_brand, brand), (by_model, model)):
            bucket[key]["proposals"] += 1
            if final == APPROVED:
                bucket[key]["approved"] += 1
            elif final == REJECTED:
                bucket[key]["rejected"] += 1
            elif final == PENDING:
                bucket[key]["pending"] += 1

        vals = {m: _num(r.get(ARR_FIELD[m])) for m in ARR_METRICS}
        for m in ARR_METRICS:
            acc[m].append(vals[m])
        bk = BRAND_OUT.get(brand)
        if bk:
            for m in ARR_METRICS:
                acc_brand[bk][m].append(vals[m])

    decided = approved + rejected
    approval_rate = round((approved / decided) * 100, 1) if decided else 0.0

    def dept_out(d):
        req, ap, rj = d["required"], d["approved"], d["rejected"]
        return {"required": req, "approved": ap, "rejected": rj,
                "pending": req - ap - rj}

    return {
        "generated": generated,
        "totals": {
            "proposals": total,
            "approved": approved,
            "rejected": rejected,
            "pending": pending,
            "notRouted": none_state,
            "approvalRatePct": approval_rate,
        },
        "byDeptApproval": {d: dept_out(dept[d]) for d in ("salesRevenue", "design", "ops")},
        "byBrand": {b: v for b, v in by_brand.items()},
        "byModel": {m: v for m, v in by_model.items()},
        "arrOccupancy": _arr_block(acc),
        "arrOccupancyByBrand": {bk: _arr_block(acc_brand[bk])
                                for bk in ("Olive", "Spark", "Open Hotels")},
    }


def fetch_proposals():
    if not (ZOHO_CLIENT_ID and ZOHO_REFRESH_TOKEN):
        print("  [WARN] Zoho creds missing; returning no records"); return []
    if requests is None:
        print("  [WARN] requests not installed; cannot fetch"); return []
    print("Fetching Proposals (Awaiting_BusinessApproval) ...")
    r = requests.post("https://accounts.zoho.in/oauth/v2/token",
        params={"refresh_token": ZOHO_REFRESH_TOKEN, "client_id": ZOHO_CLIENT_ID,
                "client_secret": ZOHO_CLIENT_SECRET, "grant_type": "refresh_token"}, timeout=20)
    r.raise_for_status(); token = r.json()["access_token"]
    headers = {"Authorization": f"Zoho-oauthtoken {token}"}
    records, page = [], 1
    while True:
        rr = requests.get(f"https://www.zohoapis.in/crm/v2/{MODULE}", headers=headers,
                          params={"fields": PROPOSAL_FIELDS, "page": page, "per_page": 200}, timeout=30)
        if rr.status_code == 204:
            break
        rr.raise_for_status(); js = rr.json()
        records.extend(js.get("data", []))
        if not js.get("info", {}).get("more_records"):
            break
        page += 1
    print(f"  {len(records):,} Proposal records")
    return records


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "proposals.json"
    recs = fetch_proposals()
    feed = build_proposals(recs)
    json.dump(feed, open(out, "w"), separators=(",", ":"), default=str)
    print("wrote", out)
