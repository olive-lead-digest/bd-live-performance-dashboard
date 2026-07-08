#!/usr/bin/env python3
"""Build the Olive Hospitality "proposals" feed (proposals.json) for the BD dashboard.

Proposals are the PRE-deal, under-approval entity in the BD funnel:
    Leads -> PROPOSALS (dept approvals) -> Deals -> Signings.
When a lead qualifies a BD creates a Proposal; it needs department approvals
(Sales/Revenue, Design, Ops) depending on brand/model. Once all required
approvals are received a Deal is auto-created at stage "Business Approval Received".

In Zoho this is the custom module **Awaiting_BusinessApproval** (module_name
CustomModule15; singular label "Proposal"). Verified via getFields on the live org.

Canonical Zoho field API names used here (all on Awaiting_BusinessApproval):
  Final_Decision      picklist  overall proposal state: Approved / Rejected /
                                To be approved / -None-  (this is the funnel state)
  Approval_Status     picklist  Design Approval Status   (Approved/Rejected/To be approved/-None-)
  Approval_Status1    picklist  Ops Approval Status      (Approved/Rejected/To Be Approved/-None-)
  Approval_Status2    picklist  Sales/Revenue Approval Status (Approved/Rejected/To be approved/-None-)
  Brand               picklist  Open / Olive / Spark
  Sub_Brand           picklist  Model: Management / Franchise
  Arr_1st_Year        text      Year-1 ARR (free text / number-ish)
  Arr_1st_Year_Occ    percent   Year-1 occupancy %
  Stabilised_Arr      text      Stabilised ARR
  Stabilised_Occ      percent   Stabilised occupancy %
  Number_1            integer   Landlord expected ARR
  landlord_expected_Occupancy  percent  Landlord expected occupancy %
  Record_Status__s    picklist  Available / Draft / Trash  (Trash filtered out)

Output shape (consumed by the dashboard's ProposalsStageCard):
  {"generated",
   "totals": {proposals, approved, rejected, pending, approvalRatePct},
   "byDeptApproval": {"salesRevenue":{approved,rejected,pending,none},
                      "design":{...}, "ops":{...}},
   "byBrand": {<brand>: {proposals, approved, rejected, pending}},
   "byModel": {Management|Franchise: {...}},
   "arrOccupancy": {"year1Arr":{avg,n}, "year1Occ":{avg,n},
                    "stabilisedArr":{avg,n}, "stabilisedOcc":{avg,n},
                    "landlordArr":{avg,n}, "landlordOcc":{avg,n}}}

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

# Approval-state buckets. Zoho picklists use slightly different casings for the
# "to be approved" value across the three department fields, so match loosely.
APPROVED = "approved"
REJECTED = "rejected"
PENDING  = "pending"   # "To be approved" / "To Be Approved"
NONE     = "none"      # "-None-" / null (not applicable / not routed)


def _num(v):
    """Coerce a currency/number-ish value (or Zoho {'value':..} dict) to float."""
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
    """Normalise a department/final approval picklist value to a canonical bucket."""
    s = str(v or "").strip().lower()
    if s in ("", "-none-", "none"):
        return NONE
    if s == "approved":
        return APPROVED
    if s == "rejected":
        return REJECTED
    if "approv" in s:  # 'to be approved' / 'to be approved.'
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
    """Return {'avg':..,'n':..} for a list of numbers (None entries ignored).
    Optional [lo, hi] range filters out out-of-range dirty values (e.g. an
    occupancy field with a stray '850' entered) so the average stays meaningful."""
    xs = [x for x in values if x is not None]
    if lo is not None:
        xs = [x for x in xs if x >= lo]
    if hi is not None:
        xs = [x for x in xs if x <= hi]
    if not xs:
        return {"avg": None, "n": 0}
    return {"avg": round(sum(xs) / len(xs), 2), "n": len(xs)}


def build_proposals(records, generated=None):
    """Aggregate a list of Zoho Awaiting_BusinessApproval dicts into proposals.json."""
    generated = generated or datetime.datetime.now().isoformat(timespec="seconds")

    approved = rejected = pending = none_state = 0
    dept = {
        "salesRevenue": defaultdict(int),
        "design": defaultdict(int),
        "ops": defaultdict(int),
    }
    by_brand = defaultdict(lambda: {"proposals": 0, "approved": 0, "rejected": 0, "pending": 0})
    by_model = defaultdict(lambda: {"proposals": 0, "approved": 0, "rejected": 0, "pending": 0})
    acc = {k: [] for k in ("year1Arr", "year1Occ", "stabilisedArr", "stabilisedOcc",
                            "landlordArr", "landlordOcc")}

    total = 0
    for r in records:
        # Skip trashed / recycle-bin rows.
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

        dept["salesRevenue"][approval_bucket(r.get("Approval_Status2"))] += 1
        dept["design"][approval_bucket(r.get("Approval_Status"))] += 1
        dept["ops"][approval_bucket(r.get("Approval_Status1"))] += 1

        brand = norm_brand(r.get("Brand"))
        model = norm_model(r.get("Sub_Brand"))
        for bucket, key in ((by_brand, brand), (by_model, model)):
            bucket[key]["proposals"] += 1
            if final == APPROVED:
                bucket[key]["approved"] += 1
            elif final == REJECTED:
                bucket[key]["rejected"] += 1
            elif final == PENDING:
                bucket[key]["pending"] += 1

        acc["year1Arr"].append(_num(r.get("Arr_1st_Year")))
        acc["year1Occ"].append(_num(r.get("Arr_1st_Year_Occ")))
        acc["stabilisedArr"].append(_num(r.get("Stabilised_Arr")))
        acc["stabilisedOcc"].append(_num(r.get("Stabilised_Occ")))
        acc["landlordArr"].append(_num(r.get("Number_1")))
        acc["landlordOcc"].append(_num(r.get("landlord_expected_Occupancy")))

    decided = approved + rejected
    approval_rate = round((approved / decided) * 100, 1) if decided else 0.0

    def dept_out(d):
        return {"approved": d.get(APPROVED, 0), "rejected": d.get(REJECTED, 0),
                "pending": d.get(PENDING, 0), "none": d.get(NONE, 0)}

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
        "byDeptApproval": {
            "salesRevenue": dept_out(dept["salesRevenue"]),
            "design": dept_out(dept["design"]),
            "ops": dept_out(dept["ops"]),
        },
        "byBrand": {b: v for b, v in by_brand.items()},
        "byModel": {m: v for m, v in by_model.items()},
        "arrOccupancy": {
            "year1Arr": _avg(acc["year1Arr"], lo=0),
            "year1Occ": _avg(acc["year1Occ"], lo=0, hi=100),
            "stabilisedArr": _avg(acc["stabilisedArr"], lo=0),
            "stabilisedOcc": _avg(acc["stabilisedOcc"], lo=0, hi=100),
            "landlordArr": _avg(acc["landlordArr"], lo=0),
            "landlordOcc": _avg(acc["landlordOcc"], lo=0, hi=100),
        },
    }


# --- Live Zoho fetch ---------------------------------------------------------
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
