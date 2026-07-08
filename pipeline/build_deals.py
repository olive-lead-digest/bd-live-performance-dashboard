#!/usr/bin/env python3
"""Build the Olive Hospitality "deals" feed (deals.json) for the BD dashboard.

Pulls the Zoho CRM **Deals** module and pre-aggregates it into the small JSON
the dashboard's /deals page consumes (served at DEALS_DATA_URL). No credentials
live in the web app; this builder owns all fetching, mirroring run_digest.py.

Output shape (consumed by src/app/deals/page.tsx):
  {"generated", "totals":{deals,signed,active,dropped,signRatePct,dropRatePct,
     keysContracted,keysContractedFY,keysUnparsed},
   "portfolio", "mtd", "ytd", "upcoming", "ranking", "dateBasis",
   "funnel":[{stage,count,type[,note]}],
   "fees":{contracted,collected,pending,collectedActual,allTime,fy,collectedBasis,undatedMASigned},
   "byBrand", "propertyType", "signingProbability", "closers":[]}

Canonical Zoho Deals field API names (verified via getFields on the live org):
  Stage, Signing_Probability (picklist High/Medium/Low), Keys (free text),
  Brand, Property_Type, Owner, Region (lookup), State,
  MA_Date (signing date), Expected_LOI_Date/Expected_Actual_LOI_Date, Expected_MA_Date,
  Expected_Actual_TA_fee_contracted / Ta_Fee_Contracted (contracted TA fee),
  TA_fee_collected (collected), Pending_TA_fee (pending).

Usage:
  python build_deals.py                 # LIVE: fetch Deals from Zoho, write deals.json
  python build_deals.py out.json        # write to a specific path
  # or import build_deals(records) with a list of Zoho Deal dicts (used by tests).
"""
import os, sys, json, re, datetime
from collections import defaultdict

try:
    import requests  # only needed for the live fetch path
except Exception:  # pragma: no cover - import guarded so tests run without requests
    requests = None

ZOHO_CLIENT_ID     = os.getenv("ZOHO_CLIENT_ID", "")
ZOHO_CLIENT_SECRET = os.getenv("ZOHO_CLIENT_SECRET", "")
ZOHO_REFRESH_TOKEN = os.getenv("ZOHO_REFRESH_TOKEN", "")

# Owners excluded from the closer leaderboard + ranking (system/admin accounts).
# Their signings STILL count in totals/funnel/fees. Match case-insensitively.
CLOSER_EXCLUDE = {"super admin", "sourav basu"}

# --- Canonical stage taxonomy (from the BD business-process doc) -------------
# Open/active stages in canonical order. LOI Signed is Spark Management only and
# precedes MA. MA Signed is WON. Everything matched by DROP_PATTERNS is a drop.
STAGE_BUSINESS_APPROVAL = "Business Approval Received"
STAGE_UNDER_NEGOTIATION = "Under Negotiation"
STAGE_LOI               = "LOI Signed"
STAGE_MA                = "MA Signed"
OPEN_STAGES_ORDER = [STAGE_BUSINESS_APPROVAL, STAGE_UNDER_NEGOTIATION, STAGE_LOI]
CANON_FUNNEL_ORDER = [STAGE_BUSINESS_APPROVAL, STAGE_UNDER_NEGOTIATION, STAGE_LOI, STAGE_MA]

# Fields requested from the Deals module.
# Date fields (verified via getFields on the live org):
#   MA_Date            date  -> the SIGNING date for an MA-Signed (won) deal
#                             (Signing_Date/Closing_Date are unused/empty in this org).
#   Expected_Actual_LOI_Date / Expected_LOI_Date  -> LOI (Spark) actual/expected date
#   Expected_MA_Date   -> expected MA signing date (used for upcoming pipeline)
# Region is a lookup whose .name is the org region (North / South 1 (KA) /
#   South 2 (AP & TG) / South 3 (TN & KL) / East / West) -- matches bd_org.json.
# COLLECTIONS CAVEAT: TA_fee_collected is a single cumulative amount per deal; there
#   is NO per-payment/collection date field (TA_fee_schedule_date_wise is empty org-
#   wide), so MTD/YTD collections are ATTRIBUTED to the deal's signing date (MA_Date)
#   and flagged approximate. See mtd/ytd "collections.approx".
DEAL_FIELDS = (
    "Deal_Name,Stage,Signing_Probability,Keys,No_of_keys,Brand,Property_Type,Owner,"
    "Region,State,MA_Date,Expected_Actual_LOI_Date,Expected_LOI_Date,Expected_MA_Date,Closing_Date,"
    "Expected_Actual_TA_fee_contracted,Ta_Fee_Contracted,TA_fee_collected,Actual_Amount_Total,Pending_TA_fee"
)
# The actual-received rollup of the TA payment schedule (Zoho label "Actual  Amount
# Total"). Exposed as `collectedActual` alongside the cumulative-keyed TA_fee_collected.
COLLECTED_FIELD = "Actual_Amount_Total"

PROB_LEVELS = ["High", "Medium", "Low"]  # + "Unspecified" bucket


def _num(v):
    """Coerce a currency/number-ish value (or Zoho {'value':..} dict) to float."""
    if v is None:
        return 0.0
    if isinstance(v, dict):
        v = v.get("value")
    try:
        return float(v)
    except (TypeError, ValueError):
        m = re.search(r"-?\d+(?:\.\d+)?", str(v).replace(",", ""))
        return float(m.group()) if m else 0.0


# A RANGE like '150-200', '35 – 45', '30 to 40' -- two numbers with a separator.
# The Keys field must be a SINGLE clean integer; ranges are unusable (no bound taken).
_KEYS_RANGE_RE = re.compile(r"\d+\s*(?:-|–|—|to)\s*\d+", re.I)


def parse_keys(v):
    """Parse the **Keys** field as a plain integer ONLY. Returns an int, or None
    when the value can't be read as a single clean integer.
      '40'        -> 40
      '50 keys'   -> 50            (strip non-digits)
      '1,200'     -> 1200
      '150-200'   -> None          (a RANGE: do NOT take a bound, it's unusable)
      '35 to 45'  -> None          (a RANGE)
      None / ''   -> None
    NB: no fallback to No_of_keys (that is the range field, per the data owner)."""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        n = int(v)
        return n if 0 < n <= 5000 else None
    s = str(v).replace(",", "").strip()          # '1,200' -> '1200'
    if not s:
        return None
    if _KEYS_RANGE_RE.search(s):                  # '35-45', '150 – 200', '30 to 40'
        return None
    digits = re.sub(r"\D", "", s)                 # '50 keys' -> '50'
    if not digits:
        return None
    n = int(digits)
    return n if 0 < n <= 5000 else None           # guard against stray phone/id digits


def keys_of(r):
    """Return (keys_int, unparsed). keys_int is 0 when unusable. `unparsed` is True
    ONLY when a NON-EMPTY Keys value (e.g. a range like '30-35') fails to parse as a
    single clean integer -- a blank/None Keys is treated as missing, not unparsed."""
    raw = r.get("Keys")
    n = parse_keys(raw)
    if n is not None:
        return n, False
    has_value = raw is not None and str(raw).strip() != ""
    return 0, has_value


def norm_brand(b):
    b = str(b or "").strip().lower()
    if "olive" in b:
        return "Olive"
    if "open" in b:
        return "Open Hotels"
    if "spark" in b:
        return "Spark"
    return (str(b).strip().title() or "Unknown")


def classify_stage(stage):
    """Map a raw Zoho Stage value to a canonical bucket.
    Returns one of the canonical open stages, "MA Signed", or "Dropped:<label>"."""
    s = str(stage or "").strip()
    sl = s.lower()
    # Drop stages FIRST: several drop labels contain the substring 'ma signed'
    # or 'loi' (e.g. 'Dropped after MA signed Before Operational', 'Dropped
    # After LOI Before MA Signed') and would otherwise be misread as won/LOI.
    if any(x in sl for x in ("drop", "lost", "cancel")):
        return "Dropped:" + s
    if "ma signed" in sl or ("ma" in sl and "signed" in sl and "loi" not in sl):
        return STAGE_MA
    if "loi signed" in sl:
        return STAGE_LOI
    if "business approval received" in sl or ("approval" in sl and "received" in sl):
        return STAGE_BUSINESS_APPROVAL
    # 'Under Negotiation' plus the Zoho typo 'Under Negotation'
    if "negoti" in sl or "negotation" in sl:
        return STAGE_UNDER_NEGOTIATION
    return None  # not part of the BD deals pipeline (e.g. hospitality/HR stages)


def _prob_bucket(v):
    v = str(v or "").strip()
    return v if v in PROB_LEVELS else "Unspecified"


# --- Org map (region head hierarchy + BD directory) --------------------------
_ORG_CACHE = None


def load_org(path=None):
    """Load bd_org.json and return (alias->canonical, canonical->{region,regionHead}, org).
    alias maps both the Zoho owner display name (zohoName) and the canonical name."""
    global _ORG_CACHE
    if _ORG_CACHE is not None:
        return _ORG_CACHE
    path = path or os.path.join(os.path.dirname(os.path.abspath(__file__)), "bd_org.json")
    alias, meta, org = {}, {}, {}
    try:
        org = json.load(open(path, encoding="utf-8"))
        for canon, v in org.get("bds", {}).items():
            meta[canon] = {"region": v.get("region"), "regionHead": v.get("regionHead")}
            alias[canon.strip().lower()] = canon
            zn = (v.get("zohoName") or "").strip().lower()
            if zn:
                alias[zn] = canon
    except Exception as e:  # noqa: BLE001
        print(f"  [WARN] bd_org.json not loaded ({e}); ranking will be unmapped")
    _ORG_CACHE = (alias, meta, org)
    return _ORG_CACHE


def canon_owner(owner, alias):
    """Map a Zoho owner display name to the canonical org-directory name (or itself)."""
    o = str(owner or "").strip()
    return alias.get(o.lower(), o)


def _owner_name(r):
    owner = r.get("Owner")
    if isinstance(owner, dict):
        owner = owner.get("name") or owner.get("full_name") or ""
    return str(owner or "").strip()


# State -> org region. The Zoho Deals 'Region' lookup carries these values, but the
# CRM v2 REST API omits that lookup from responses, so we derive region from the
# 'State' text field (which IS returned) using the same taxonomy. South is split into
# the org's three sub-regions; North absorbs Central per the org map ("North & Central").
STATE_REGION = {
    "karnataka": "South 1 (KA)",
    "andhra pradesh": "South 2 (AP & TG)", "telangana": "South 2 (AP & TG)",
    "tamil nadu": "South 3 (TN & KL)", "kerala": "South 3 (TN & KL)", "puducherry": "South 3 (TN & KL)",
    "maharashtra": "West", "gujarat": "West", "goa": "West",
    "delhi": "North", "delhi ncr": "North", "new delhi": "North", "haryana": "North", "punjab": "North",
    "uttar pradesh": "North", "up": "North", "uttarakhand": "North", "himachal pradesh": "North",
    "rajasthan": "North", "jammu and kashmir": "North", "jammu & kashmir": "North", "chandigarh": "North",
    "madhya pradesh": "North", "chhattisgarh": "North",
    "west bengal": "East", "bihar": "East", "jharkhand": "East", "odisha": "East", "assam": "East",
    "arunachal pradesh": "East", "manipur": "East", "meghalaya": "East", "mizoram": "East",
    "nagaland": "East", "tripura": "East", "sikkim": "East",
}


def _region_name(r):
    reg = r.get("Region")
    if isinstance(reg, dict) and reg.get("name"):
        return reg["name"].strip()
    st = str(r.get("State") or "").strip()
    if st:
        return STATE_REGION.get(st.lower(), "Other")
    return "Unspecified"


def _pdate(v):
    """Parse a Zoho date ('YYYY-MM-DD' or ISO) to datetime.date, else None."""
    if not v:
        return None
    s = str(v)[:10]
    try:
        return datetime.date(int(s[0:4]), int(s[5:7]), int(s[8:10]))
    except (ValueError, IndexError):
        return None


def fy_start(today):
    """Fiscal year starts 1 April."""
    y = today.year if today.month >= 4 else today.year - 1
    return datetime.date(y, 4, 1)


def fy_months_elapsed(today):
    """Count of FY months Apr..current inclusive (Apr=1)."""
    fs = fy_start(today)
    return (today.year - fs.year) * 12 + (today.month - fs.month) + 1


def build_portfolio(records):
    """Won-deal portfolio counts by brand + Spark LOI (LOI is Spark-only)."""
    p = {"oliveMA": 0, "sparkMA": 0, "openMA": 0, "sparkLOI": 0}
    for r in records:
        canon = classify_stage(r.get("Stage"))
        if canon == STAGE_MA:
            b = norm_brand(r.get("Brand"))
            if b == "Olive":
                p["oliveMA"] += 1
            elif b == "Spark":
                p["sparkMA"] += 1
            elif b == "Open Hotels":
                p["openMA"] += 1
        elif canon == STAGE_LOI:
            p["sparkLOI"] += 1
    return p


def _period_block(records, start, end=None):
    """Signings + collections for won deals whose MA_Date is in [start, end].
    Collections are ATTRIBUTED to signing date (no per-payment date exists)."""
    sig = {"count": 0, "byBrand": defaultdict(int), "byRegion": defaultdict(int)}
    col = {"amount": 0.0, "byBrand": defaultdict(float), "byRegion": defaultdict(float)}
    for r in records:
        if classify_stage(r.get("Stage")) != STAGE_MA:
            continue
        d = _pdate(r.get("MA_Date"))
        if not d or d < start or (end and d > end):
            continue
        brand = norm_brand(r.get("Brand"))
        region = _region_name(r)
        amt = _num(r.get(COLLECTED_FIELD))
        sig["count"] += 1
        sig["byBrand"][brand] += 1
        sig["byRegion"][region] += 1
        col["amount"] += amt
        col["byBrand"][brand] += amt
        col["byRegion"][region] += amt
    return {
        "signings": {"count": sig["count"], "byBrand": dict(sig["byBrand"]),
                     "byRegion": dict(sig["byRegion"])},
        "collections": {"amount": round(col["amount"], 2),
                        "byBrand": {k: round(v, 2) for k, v in col["byBrand"].items()},
                        "byRegion": {k: round(v, 2) for k, v in col["byRegion"].items()},
                        "approx": True},
    }


def build_upcoming(records, today, horizon_days=20):
    """OPEN High-probability deals with an expected LOI or MA date within the next
    `horizon_days`. Each item: dealName, brand, bd, region, keys, expectedDate, type, taFee."""
    end = today + datetime.timedelta(days=horizon_days)
    out = []
    for r in records:
        canon = classify_stage(r.get("Stage"))
        if canon not in OPEN_STAGES_ORDER:  # open pipeline only (incl LOI Signed)
            continue
        if _prob_bucket(r.get("Signing_Probability")) != "High":
            continue
        cands = []
        if canon != STAGE_LOI:  # LOI already signed -> no upcoming LOI event
            d = _pdate(r.get("Expected_LOI_Date")) or _pdate(r.get("Expected_Actual_LOI_Date"))
            if d:
                cands.append((d, "LOI"))
        d = _pdate(r.get("Expected_MA_Date"))
        if d:
            cands.append((d, "MA"))
        cands = [(d, t) for (d, t) in cands if today <= d <= end]
        if not cands:
            continue
        d, typ = min(cands, key=lambda x: x[0])
        fee = _num(r.get("TA_fee_collected")) or _num(r.get("Expected_Actual_TA_fee_contracted")) or _num(r.get("Ta_Fee_Contracted"))
        out.append({
            "dealName": str(r.get("Deal_Name") or "").strip(),
            "brand": norm_brand(r.get("Brand")),
            "bd": _owner_name(r) or "Unassigned",
            "region": _region_name(r),
            "keys": parse_keys(r.get("Keys")) or 0,   # Keys field only; range/blank -> 0
            "expectedDate": d.isoformat(),
            "type": typ,
            "taFee": round(fee, 2),
        })
    out.sort(key=lambda x: x["expectedDate"])
    return out


def build_ranking(records, today):
    """Points-based BD ranking for the current fiscal year.
    Target: 1 pt/month -> ytdTarget = FY months elapsed (Apr..current).
    Achievement points per signing in current FY:
      Olive MA = 1, Open MA = 0.5, Spark = 1 counted on LOI (Spark MA not counted).
    Excludes Super Admin / Sourav Basu. Returns {bds:[...], regions:[...], meta:{...}}."""
    alias, meta, org = load_org()
    fs = fy_start(today)
    target = fy_months_elapsed(today)

    ach = defaultdict(float)   # canonical BD name -> achievement points
    seen_owner = {}            # canonical -> original display name (for reference)

    def add(owner, pts):
        if not owner:
            return
        canon = canon_owner(owner, alias)
        if canon.strip().lower() in CLOSER_EXCLUDE:
            return
        ach[canon] += pts
        seen_owner.setdefault(canon, owner)

    for r in records:
        canon_stage = classify_stage(r.get("Stage"))
        owner = _owner_name(r)
        brand = norm_brand(r.get("Brand"))
        if canon_stage == STAGE_MA:
            d = _pdate(r.get("MA_Date"))
            if d and d >= fs:
                if brand == "Olive":
                    add(owner, 1.0)
                elif brand == "Open Hotels":
                    add(owner, 0.5)
                # Spark MA intentionally NOT counted (point earned at LOI).
        elif canon_stage == STAGE_LOI:
            d = _pdate(r.get("Expected_Actual_LOI_Date")) or _pdate(r.get("Expected_LOI_Date"))
            if d and d >= fs and brand == "Spark":
                add(owner, 1.0)

    # Seed every directory BD so non-signers still appear (target set, 0 achievement).
    names = set(ach.keys())
    for canon in meta:
        if canon.strip().lower() not in CLOSER_EXCLUDE:
            names.add(canon)

    bds = []
    for canon in names:
        m = meta.get(canon, {})
        a = round(ach.get(canon, 0.0), 2)
        bds.append({
            "bd": canon,
            "region": m.get("region"),
            "regionHead": m.get("regionHead"),
            "ytdTarget": target,
            "ytdAchievement": a,
            "achievementPct": round((a / target) * 100, 1) if target else 0.0,
        })
    bds.sort(key=lambda x: x["ytdAchievement"], reverse=True)
    for i, b in enumerate(bds, 1):
        b["rank"] = i

    # Region-wise aggregate (only mapped regions; unmapped BDs grouped as "Unmapped").
    reg = defaultdict(lambda: {"bds": 0, "ytdTarget": 0, "ytdAchievement": 0.0, "regionHead": None})
    for b in bds:
        rk = b["region"] or "Unmapped"
        reg[rk]["bds"] += 1
        reg[rk]["ytdTarget"] += b["ytdTarget"]
        reg[rk]["ytdAchievement"] += b["ytdAchievement"]
        if b["regionHead"]:
            reg[rk]["regionHead"] = b["regionHead"]
    regions = []
    for rk, v in reg.items():
        regions.append({
            "region": rk, "regionHead": v["regionHead"], "bds": v["bds"],
            "ytdTarget": v["ytdTarget"], "ytdAchievement": round(v["ytdAchievement"], 2),
            "achievementPct": round((v["ytdAchievement"] / v["ytdTarget"]) * 100, 1) if v["ytdTarget"] else 0.0,
        })
    regions.sort(key=lambda x: x["ytdAchievement"], reverse=True)
    for i, rr in enumerate(regions, 1):
        rr["rank"] = i

    return {
        "meta": {
            "fyStart": fs.isoformat(),
            "monthsElapsed": target,
            "targetPerMonth": 1,
            "pointRules": "Olive MA=1, Open MA=0.5, Spark=1 (counted at LOI; Spark MA not counted)",
            "excluded": sorted(CLOSER_EXCLUDE),
        },
        "bds": bds,
        "regions": regions,
    }


def build_deals(records, generated=None, today=None):
    """Aggregate a list of Zoho Deal dicts into the deals.json feed."""
    generated = generated or datetime.datetime.now().isoformat(timespec="seconds")
    today = today or datetime.date.today()
    fs = fy_start(today)

    stage_counts = defaultdict(int)          # canonical open stage -> count
    drop_counts = defaultdict(int)           # drop label -> count
    signed = active = dropped = 0
    keys_contracted = 0                      # sum of Keys over MA-signed (all-time)
    keys_contracted_fy = 0                   # sum of Keys over MA-signed in current FY
    keys_unparsed = 0                        # MA-signed deals whose Keys is a range/garbage
    fy_signed = 0                            # MA-signed deals with MA_Date in current FY
    undated_ma = 0                           # MA-signed deals with NO MA_Date
    by_brand = defaultdict(lambda: {"deals": 0, "signed": 0, "keys": 0})
    prop_type = defaultdict(int)
    closers = defaultdict(lambda: {"signed": 0, "feeContracted": 0.0})
    # Fees accumulated on BOTH scopes. contracted=Ta_Fee_Contracted, collected=
    # TA_fee_collected (cumulative keyed), collectedActual=Actual_Amount_Total (received),
    # pending=Pending_TA_fee.
    fees_all = {"contracted": 0.0, "collected": 0.0, "collectedActual": 0.0, "pending": 0.0}
    fees_fy = {"contracted": 0.0, "collected": 0.0, "collectedActual": 0.0, "pending": 0.0}
    sign_prob = {k: {"count": 0, "keys": 0} for k in PROB_LEVELS + ["Unspecified"]}

    for r in records:
        canon = classify_stage(r.get("Stage"))
        if canon is None:
            continue  # not a BD deal stage
        keys, keys_bad = keys_of(r)          # Keys field only; no No_of_keys fallback
        brand = norm_brand(r.get("Brand"))
        ptype = str(r.get("Property_Type") or "Unspecified").strip() or "Unspecified"
        owner = r.get("Owner")
        if isinstance(owner, dict):
            owner = owner.get("name") or owner.get("full_name") or ""
        owner = str(owner or "").strip()

        is_won = canon == STAGE_MA
        is_drop = canon.startswith("Dropped:")
        is_open = canon in OPEN_STAGES_ORDER

        by_brand[brand]["deals"] += 1
        by_brand[brand]["keys"] += keys
        prop_type[ptype] += 1

        if is_won:
            signed += 1
            keys_contracted += keys   # keysContracted counts MA-Signed (won) deals ONLY
            if keys_bad:
                keys_unparsed += 1
            stage_counts[STAGE_MA] += 1
            by_brand[brand]["signed"] += 1
            c  = _num(r.get("Ta_Fee_Contracted"))
            cl = _num(r.get("TA_fee_collected"))
            ca = _num(r.get(COLLECTED_FIELD))          # Actual_Amount_Total (received)
            pd = _num(r.get("Pending_TA_fee"))
            fees_all["contracted"] += c
            fees_all["collected"] += cl
            fees_all["collectedActual"] += ca
            fees_all["pending"] += pd
            d = _pdate(r.get("MA_Date"))
            if d is None:
                undated_ma += 1
            elif d >= fs:
                fy_signed += 1
                keys_contracted_fy += keys
                fees_fy["contracted"] += c
                fees_fy["collected"] += cl
                fees_fy["collectedActual"] += ca
                fees_fy["pending"] += pd
            fee_c = _num(r.get("Expected_Actual_TA_fee_contracted")) or c
            if owner and owner.strip().lower() not in CLOSER_EXCLUDE:
                closers[owner]["signed"] += 1
                closers[owner]["feeContracted"] += fee_c
        elif is_drop:
            dropped += 1
            drop_counts[canon.split(":", 1)[1]] += 1
        elif is_open:
            active += 1
            stage_counts[canon] += 1
            b = _prob_bucket(r.get("Signing_Probability"))
            sign_prob[b]["count"] += 1
            sign_prob[b]["keys"] += keys

    total = signed + active + dropped
    r1 = lambda x: round((x / total) * 100, 1) if total else 0.0

    # --- Funnel in enforced canonical order --------------------------------
    funnel = []
    for st in CANON_FUNNEL_ORDER:
        entry = {"stage": st, "count": stage_counts.get(st, 0),
                 "type": "won" if st == STAGE_MA else "open"}
        if st == STAGE_LOI:
            entry["note"] = "Spark Management only"
        funnel.append(entry)
    for label in sorted(drop_counts):  # drop stages after the canonical path
        funnel.append({"stage": label, "count": drop_counts[label], "type": "dropped"})

    def _fees_block(f):
        return {
            "contracted": round(f["contracted"], 2),
            "collected": round(f["collected"], 2),
            "collectedActual": round(f["collectedActual"], 2),
            "pending": round(f["pending"], 2),
        }

    fees_all_block = _fees_block(fees_all)
    fees_fy_block = _fees_block(fees_fy)
    fees_fy_block["fyStart"] = fs.isoformat()
    fees_fy_block["deals"] = fy_signed

    mtd_start = today.replace(day=1)
    return {
        "generated": generated,
        "totals": {
            "deals": total, "signed": signed, "active": active, "dropped": dropped,
            "signRatePct": r1(signed), "dropRatePct": r1(dropped),
            "keysContracted": keys_contracted,        # MA-signed, all-time
            "keysContractedFY": keys_contracted_fy,   # MA-signed in current FY
            "keysUnparsed": keys_unparsed,            # MA-signed with unusable Keys (ranges)
        },
        "portfolio": build_portfolio(records),
        "mtd": {"period": today.strftime("%Y-%m"), "start": mtd_start.isoformat(),
                **_period_block(records, mtd_start)},
        "ytd": {"fyStart": fs.isoformat(), "asOf": today.isoformat(),
                **_period_block(records, fs)},
        "upcoming": build_upcoming(records, today, 20),
        "ranking": build_ranking(records, today),
        "dateBasis": {"signings": "MA_Date", "loi": "Expected_Actual_LOI_Date/Expected_LOI_Date",
                      "collections": "attributed to MA_Date (no per-payment date field)",
                      "region": "derived from State (v2 REST omits Region lookup)"},
        "funnel": funnel,
        "fees": {
            # Back-compat top-level (all-time, contracted book basis).
            "contracted": fees_all_block["contracted"],
            "collected": fees_all_block["collected"],
            "pending": fees_all_block["pending"],
            "collectedActual": fees_all_block["collectedActual"],
            # Both scopes, clearly keyed.
            "allTime": fees_all_block,
            "fy": fees_fy_block,
            "collectedBasis": ("TA_fee_collected is cumulative per deal with no payment "
                               "date; FY collected = collected on deals SIGNED in this FY, "
                               "not cash received this FY."),
            "undatedMASigned": undated_ma,
        },
        "byBrand": {b: v for b, v in by_brand.items()},
        "propertyType": {p: c for p, c in prop_type.items()},
        "signingProbability": sign_prob,
        "closers": sorted(
            [{"bd": bd, "signed": v["signed"], "feeContracted": round(v["feeContracted"], 2)}
             for bd, v in closers.items()],
            key=lambda x: (x["signed"], x["feeContracted"]), reverse=True),
    }


# --- Live Zoho fetch ---------------------------------------------------------
def fetch_deals():
    if not (ZOHO_CLIENT_ID and ZOHO_REFRESH_TOKEN):
        print("  [WARN] Zoho creds missing; returning no records"); return []
    if requests is None:
        print("  [WARN] requests not installed; cannot fetch"); return []
    print("Fetching Deals ...")
    r = requests.post("https://accounts.zoho.in/oauth/v2/token",
        params={"refresh_token": ZOHO_REFRESH_TOKEN, "client_id": ZOHO_CLIENT_ID,
                "client_secret": ZOHO_CLIENT_SECRET, "grant_type": "refresh_token"}, timeout=20)
    r.raise_for_status(); token = r.json()["access_token"]
    headers = {"Authorization": f"Zoho-oauthtoken {token}"}
    records, page = [], 1
    while True:
        rr = requests.get("https://www.zohoapis.in/crm/v2/Deals", headers=headers,
                          params={"fields": DEAL_FIELDS, "page": page, "per_page": 200}, timeout=30)
        if rr.status_code == 204:
            break
        rr.raise_for_status(); js = rr.json()
        records.extend(js.get("data", []))
        if not js.get("info", {}).get("more_records"):
            break
        page += 1
    print(f"  {len(records):,} Deals records")
    return records


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "deals.json"
    recs = fetch_deals()
    feed = build_deals(recs)
    json.dump(feed, open(out, "w"), separators=(",", ":"), default=str)
    print("wrote", out)
# end of build_deals.py
