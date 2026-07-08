#!/usr/bin/env python3
"""Partner With Us — Lead Intelligence Digest v4
FORMAT LOCKED to the 13 Jun 2026 reference (see digest_locked_format_reference.html).
Reverted 15 Jun 2026: restored branded header + "Partner Leads Digest" subject;
removed the BD Training Flags block. Pre-revert copy: run_digest_v14jun_backup.py."""
import os, re, smtplib, argparse, requests
from datetime import datetime, date, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from io import StringIO
from dotenv import load_dotenv
import pandas as pd

load_dotenv(dotenv_path=os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

SHEET_ID   = "1EeF7_P54sNvB5hvmeqJ0mNBemEE1wWr7dy7Oxh60270"
TO_EMAILS  = ["harshit.s@oliveliving.com", "dhruv@oliveliving.com", "kahraman@oliveliving.com", "sahil.a@oliveliving.com", "nitish.c@oliveliving.com", "arpit.s@oliveliving.com", "syedmazher.s@oliveliving.com", "shreedhar.a@oliveliving.com", "ajith.s@oliveliving.com", "rohan.j@oliveliving.com", "tabrez.a@oliveliving.com", "abhishek.k@oliveliving.com", "ashish.v@oliveliving.com", "mohd.z@oliveliving.com", "shiva.s@oliveliving.com", "inderjeet.a@oliveliving.com", "ankur.p@oliveliving.com", "prasoon.s@oliveliving.com", "iqura.h@oliveliving.com", "vaishnava.j-ext@oliveliving.com", "dev.s@oliveliving.com", "preetham.a@oliveliving.com", "nakkani.k@oliveliving.com", "haresh.n@oliveliving.com", "aromal.b@oliveliving.com", "sawan.b@oliveliving.com", "akhil.c@oliveliving.com", "amrit.m@oliveliving.com", "sukhpreet.l@oliveliving.com"]  # updated 12 Jun 2026: leadership + full BD team (Vikas S & Sashwat pending email IDs)
SMTP_USER  = os.getenv("GMAIL_USER", "theopenhotels@gmail.com")
SMTP_PASS  = os.getenv("GMAIL_APP_PASSWORD", "")
ZOHO_CLIENT_ID     = os.getenv("ZOHO_CLIENT_ID", "")
ZOHO_CLIENT_SECRET = os.getenv("ZOHO_CLIENT_SECRET", "")
ZOHO_REFRESH_TOKEN = os.getenv("ZOHO_REFRESH_TOKEN", "")
ZOOM_ACCOUNT_ID         = os.getenv("ZOOM_ACCOUNT_ID", "")
ZOOM_PHONE_CLIENT_ID    = os.getenv("ZOOM_PHONE_CLIENT_ID", "")
ZOOM_PHONE_CLIENT_SECRET= os.getenv("ZOOM_PHONE_CLIENT_SECRET", "")
ZOOM_DEPARTMENT         = os.getenv("ZOOM_DEPARTMENT", "Business Development")
ANTHROPIC_API_KEY       = os.getenv("ANTHROPIC_API_KEY", "")
ZOOM_QUALITY_MODE       = os.getenv("ZOOM_QUALITY_MODE", "false").lower() == "true"

TABS = {
    "Spark by Hilton Leads": "Spark", "Spark Delhi NCR": "Spark",
    "Olive Delhi NCR": "Olive", "Olive Living (New)": "Olive", "Olive Living Leads": "Olive",
    "Open Hotel Delhi NCR": "Open Hotels", "Open Hotel (Old)": "Open Hotels",
    "Open Hotel Bangalore": "Open Hotels", "Open Hotel (New)": "Open Hotels",
    "Mysore | Meta Leads": "Open Hotels", "Mysore Campaign": "Open Hotels",
}
_override = os.getenv("DIGEST_DATE", "")
TODAY  = date.fromisoformat(_override) if _override else date.today()

import calendar as _cal
PERIOD = os.getenv("DIGEST_PERIOD", "month").lower()

def _period_bounds():
    ref = TODAY
    if PERIOD == "day":
        return ref, ref, ref-timedelta(1), ref-timedelta(1)
    elif PERIOD == "week":
        s = ref - timedelta(ref.weekday())
        return s, ref, s-timedelta(7), s-timedelta(1)
    elif PERIOD == "quarter":
        q0 = (ref.month-1)//3*3+1
        s = date(ref.year, q0, 1)
        pq0 = q0-3 if q0>3 else 10
        pqy = ref.year if q0>3 else ref.year-1
        ps = date(pqy, pq0, 1)
        pem = pq0+2; pe = date(pqy, pem, _cal.monthrange(pqy, pem)[1])
        return s, ref, ps, pe
    elif PERIOD == "year":
        return date(ref.year,1,1), ref, date(ref.year-1,1,1), date(ref.year-1,12,31)
    else:  # month default — compare same elapsed days in prev month (pace comparison)
        s = ref.replace(day=1)
        pm = 12 if ref.month==1 else ref.month-1
        py = ref.year-1 if ref.month==1 else ref.year
        days_elapsed = (ref - s).days  # 0-based days into current month
        ps = date(py, pm, 1)
        prev_max = _cal.monthrange(py, pm)[1]
        pe = date(py, pm, min(days_elapsed + 1, prev_max))  # same day number in prev month
        return s, ref, ps, pe

CUR_START, CUR_END, PREV_START, PREV_END = _period_bounds()

_P_LABEL = {"day":TODAY.strftime("%d %b %Y"),"week":f"Week {TODAY.isocalendar()[1]} · {TODAY.year}",
            "month":TODAY.strftime("%B %Y"),"quarter":f"Q{(TODAY.month-1)//3+1} {TODAY.year}",
            "year":str(TODAY.year)}.get(PERIOD, TODAY.strftime("%B %Y"))
_P_SHORT = {"day":"Today","week":"This Week","month":"This Month",
            "quarter":f"Q{(TODAY.month-1)//3+1}","year":str(TODAY.year)}.get(PERIOD,"This Month")
_P_PREV  = {"day":"Yesterday","week":"Last Week",
            "month":f"{PREV_START.strftime('%b')} 1–{PREV_END.day}",
            "quarter":f"Q{(PREV_START.month-1)//3+1} {PREV_START.year}",
            "year":str(PREV_START.year)}.get(PERIOD,"Last Month")

BRANDS = ["Olive", "Open Hotels", "Spark"]
BRAND_DISPLAY = {"Olive": "Olive", "Open Hotels": "Open Hotels", "Spark": "Spark by Hilton"}
BRAND_COLOR   = {"Olive": "#3D7A4F", "Open Hotels": "#C8722A", "Spark": "#0057A8"}
BRAND_LIGHT   = {"Olive": "#EAF4EC", "Open Hotels": "#FDF0E6", "Spark": "#E8F0FA"}
CRM_STATUSES  = ["New Leads","Lead Contacted","Under Discussion","Lead Dropped"]
CONT_S = ["Lead Contacted","Under Discussion"]
# All lead sources per the BD process doc. Kept for reference/labelling only —
# the pipeline no longer FILTERS by source; every source is ingested.
LEAD_SOURCES = {"Meta Campaigns-Direct","Meta Campaigns-Inbound","Website","Chatbot",
                "Direct -Broker","Direct – Referral"}
META_SOURCES = LEAD_SOURCES  # back-compat alias; no longer used as a filter

CITY_ALIASES = {
    "bangalore":"Bengaluru","new delhi":"Delhi","navi mumbai":"Mumbai",
    "gurgaon":"Gurugram","bombay":"Mumbai","calcutta":"Kolkata","madras":"Chennai",
}
TIER1 = {"mumbai","delhi","bengaluru","hyderabad","chennai","kolkata","pune",
          "ahmedabad","gurugram","noida","thane"}
TIER2 = {"jaipur","lucknow","kanpur","nagpur","surat","vadodara","bhopal","indore",
          "coimbatore","kochi","patna","chandigarh","ludhiana","agra","nashik",
          "faridabad","meerut","rajkot","aurangabad","amritsar","ranchi","jabalpur",
          "gwalior","vijayawada","jodhpur","madurai","raipur","kota","guwahati",
          "solapur","mysuru","trichy","bareilly","varanasi","dehradun","bhubaneswar",
          "siliguri","udaipur","shimla"}
RELIG = {"varanasi","mathura","vrindavan","tirupati","puri","haridwar","rishikesh",
         "amritsar","shirdi","dwarka","ayodhya","ujjain","pushkar"}
TOUR  = {"shimla","manali","goa","ooty","darjeeling","mussoorie","nainital",
         "kodaikanal","munnar","pondicherry","coorg","leh","udaipur","jaisalmer"}
NULL_CITIES = {"other","others","na","n/a","none","","unknown","nil","-","other "}

def norm_city(c):
    if not c or str(c).strip()=="": return ""
    c=str(c).strip(); low=c.lower()
    return CITY_ALIASES.get(low, c.title())

def norm_phone(v):
    """Normalise any phone string to a 10-digit Indian mobile number, or ''."""
    # Strip float suffix (e.g. "917892769485.0" → "917892769485")
    s = str(v).split('.')[0]
    digits = re.sub(r'\D', '', s)
    if len(digits) == 12 and digits.startswith('91'): return digits[2:]
    if len(digits) == 11 and digits.startswith('0'):  return digits[1:]
    if len(digits) == 10 and digits[0] in '6789':     return digits
    return ''

def is_real(c): return str(c).lower().strip() not in NULL_CITIES and len(str(c).strip())>1
def city_tier(c):
    c=c.lower().strip()
    return "Tier 1" if c in TIER1 else ("Tier 2" if c in TIER2 else "Tier 3")
def city_type(c):
    c=c.lower().strip()
    if c in RELIG: return "Religious"
    if c in TOUR:  return "Travel & Tourism"
    if c in TIER1 or c in TIER2: return "Business Hub"
    return "Standard"

def norm_prop(v):
    v=str(v).lower().strip() if not pd.isna(v) else ""
    if "vacant" in v: return "Vacant Land"
    if "operational" in v: return "Operational"
    if "construct" in v: return "Under Construction"
    return "Unknown"

def _col(df,*pats):
    for p in pats:
        for c in df.columns:
            if re.search(p,c,re.I): return c
    return None

def _fetch(tab):
    url=(f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/gviz/tq"
         f"?tqx=out:csv&sheet={requests.utils.quote(tab)}")
    try:
        r=requests.get(url,timeout=30); r.raise_for_status()
        return pd.read_csv(StringIO(r.text)).dropna(axis=1,how="all")
    except Exception as e:
        print(f"  [WARN] {tab}: {e}"); return pd.DataFrame()

def _norm(df,brand):
    if df.empty: return df
    df=df.copy(); df["_brand"]=brand
    dc=_col(df,r"^created_time",r"^created",r"^date")
    df["_date"]=pd.to_datetime(df[dc],errors="coerce",utc=True).dt.tz_localize(None) if dc else pd.NaT
    cc=_col(df,r"^city$",r"^city\s")
    df["_city"]=df[cc].fillna("").astype(str).str.strip().apply(norm_city) if cc else ""
    sc=_col(df,r"^state$",r"^state\s")
    df["_state"]=df[sc].fillna("").astype(str).str.strip().str.title() if sc else ""
    pc=_col(df,r"^property_status",r"property.status")
    df["_prop"]=df[pc].apply(norm_prop) if pc else "Unknown"
    df["_tier"]=df["_city"].apply(lambda c: city_tier(c) if c else "Unknown")
    df["_ctype"]=df["_city"].apply(lambda c: city_type(c) if c else "Unknown")
    phc=_col(df,r"^phone",r"^mobile",r"^whatsapp")
    df["_phone"]=df[phc].astype(str).apply(norm_phone) if phc else ""
    return df

def fetch_sheet():
    import concurrent.futures
    print("Fetching sheet (parallel) ...")
    tabs_list=list(TABS.items())
    def _fetch_tab(tb):
        tab,brand=tb
        print(f"  -> {tab}")
        raw=_fetch(tab)
        return _norm(raw,brand) if not raw.empty else None
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:
        results=list(ex.map(_fetch_tab,tabs_list))
    frames=[r for r in results if r is not None]
    if not frames: return pd.DataFrame()
    df=pd.concat(frames,ignore_index=True)
    print(f"  {len(df):,} rows")
    return df

def fetch_crm():
    if not (ZOHO_CLIENT_ID and ZOHO_REFRESH_TOKEN): return pd.DataFrame()
    print("Fetching CRM ...")
    try:
        r=requests.post("https://accounts.zoho.in/oauth/v2/token",
            params={"refresh_token":ZOHO_REFRESH_TOKEN,"client_id":ZOHO_CLIENT_ID,
                    "client_secret":ZOHO_CLIENT_SECRET,"grant_type":"refresh_token"},timeout=20)
        r.raise_for_status(); token=r.json()["access_token"]
    except Exception as e: print(f"  [WARN] {e}"); return pd.DataFrame()
    headers={"Authorization":f"Zoho-oauthtoken {token}"}
    fields="Brand,Lead_Status,Owner,City,Land_Status,Property_Type1,Lead_Dropped_Reasons,Lead_Source,LL_Expected_ARR,Created_Time,Phone,Mobile,States"
    # Fetch page 1 to learn total, then parallel-fetch remaining pages
    def _crm_page(page):
        try:
            r=requests.get("https://www.zohoapis.in/crm/v2/Leads",headers=headers,
                params={"fields":fields,"page":page,"per_page":200},timeout=30)
            if r.status_code==204: return [],False
            r.raise_for_status()
            js=r.json(); return js.get("data",[]),js.get("info",{}).get("more_records",False)
        except Exception as e: print(f"  [WARN] p{page}: {e}"); return [],False
    data1,more=_crm_page(1)
    records=list(data1)
    if more:
        import concurrent.futures as _cf
        p=2
        while more:
            pages=list(range(p,p+8))
            with _cf.ThreadPoolExecutor(max_workers=8) as ex:
                results=list(ex.map(_crm_page,pages))
            for d,m in results:
                records.extend(d)
                more=m
            p+=8
            if not any(m for _,m in results): break
    if not records: return pd.DataFrame()
    df=pd.json_normalize(records)
    # Ingest ALL lead sources (no source restriction). Detect the source column so
    # the raw Lead_Source value can be preserved on each record downstream.
    src_col = next((c for c in df.columns if c.lower() == "lead_source"), None)
    print(f"  {len(df):,} CRM records")
    rmap={}
    for c in df.columns:
        lc=c.lower()
        if lc=="brand": rmap[c]="Brand"
        elif lc=="lead_status": rmap[c]="Status"
        elif "owner" in lc and "name" in lc: rmap[c]="Owner"
        elif lc=="city": rmap[c]="City"
        elif lc=="land_status": rmap[c]="LandStatus"
        elif lc=="property_type1": rmap[c]="PropType"
        elif lc=="lead_dropped_reasons": rmap[c]="DropReason"
        elif lc=="lead_source": rmap[c]="Source"
        elif lc=="ll_expected_arr": rmap[c]="ARR"
        elif lc=="created_time": rmap[c]="CreatedTime"
    df=df.rename(columns=rmap)
    for col in ["Brand","Status","Owner","City","LandStatus","PropType","DropReason","Source"]:
        if col not in df.columns: df[col]=""
        df[col]=df[col].fillna("").astype(str).str.strip()
    if "ARR" not in df.columns: df["ARR"]=None
    df["ARR"]=pd.to_numeric(df["ARR"],errors="coerce")
    if "CreatedTime" in df.columns:
        df["CreatedTime"]=pd.to_datetime(df["CreatedTime"],errors="coerce",utc=True).dt.tz_localize(None)
    else: df["CreatedTime"]=pd.NaT
    def nb(b):
        b=str(b).lower()
        if "olive" in b: return "Olive"
        if "open" in b: return "Open Hotels"
        if "spark" in b: return "Spark"
        return b.title()
    df["Brand"]=df["Brand"].apply(nb)
    def ns(s):
        sl=s.lower()
        if "contact" in sl: return "Lead Contacted"
        if "discus" in sl: return "Under Discussion"  # 'discus' catches 'discussion' + 'discusiion' (Zoho typo)
        if "approval" in sl: return "Under Discussion"  # 'Awaiting Business Approval' is not a real status; fold into Under Discussion
        if any(x in sl for x in ["drop","not interest","junk","lost"]): return "Lead Dropped"
        return "New Leads"
    df["Status"]=df["Status"].apply(ns)
    def lp(row):
        v=str(row.get("LandStatus","")).lower() or str(row.get("PropType","")).lower()
        if "vacant" in v: return "Vacant land"
        if "operational" in v: return "Operational"
        if "construct" in v: return "Under Construction"
        return "Unknown"
    df["LandProfile"]=df.apply(lp,axis=1)
    df["City"]=df["City"].apply(norm_city)
    # Use Mobile first (Meta leads), fall back to Phone
    phone_col = next((c for c in df.columns if c.lower() == "mobile"), None) or \
                next((c for c in df.columns if c.lower() == "phone"), None)
    if phone_col:
        df["_phone"] = df[phone_col].astype(str).apply(norm_phone)
    else:
        df["_phone"] = ""
    # State (Zoho lookup field 'States' -> {name,id}); flattened to States.name by
    # json_normalize. Needed for region mapping now that the Leads module is the
    # lead universe. Plus city tier and normalized property profile per lead.
    _stcol=next((c for c in df.columns if c.lower() in ("states.name","state.name")),None)
    if _stcol and _stcol in df.columns:
        df["_state"]=df[_stcol].fillna("").astype(str).str.strip().str.title()
    else:
        df["_state"]=""
    df["_state"]=df["_state"].replace({"Delhi (Nct)":"Delhi","Delhi(Nct)":"Delhi"})
    df["_tier"]=df["City"].apply(lambda c: city_tier(c) if c else "Unknown")
    df["_prop"]=df["PropType"].apply(norm_prop)
    # Age bucket for New Leads
    today_dt=pd.Timestamp(TODAY)
    def age_bucket(row):
        if row["Status"]!="New Leads" or pd.isna(row["CreatedTime"]): return None
        days=(today_dt-row["CreatedTime"]).days
        if days<7: return "Fresh (<7 days)"
        if days<30: return "Active (7-30 days)"
        if days<90: return "Stale (30-90 days)"
        return "Dead (90+ days)"
    df["AgeBucket"]=df.apply(age_bucket,axis=1)
    pm=TODAY.month-1 if TODAY.month>1 else 12
    py=TODAY.year if TODAY.month>1 else TODAY.year-1
    _cs=pd.Timestamp(CUR_START); _ce=pd.Timestamp(CUR_END)+pd.Timedelta(days=1)
    _ps=pd.Timestamp(PREV_START); _pe=pd.Timestamp(PREV_END)+pd.Timedelta(days=1)
    df["_mtd"]=df["CreatedTime"].apply(lambda d:(not pd.isna(d)) and _cs<=d<_ce)
    df["_prev"]=df["CreatedTime"].apply(lambda d:(not pd.isna(d)) and _ps<=d<_pe)
    return df

# ── ZOOM PHONE ────────────────────────────────────────────────────────────────
def _zoom_token():
    import base64
    if not (ZOOM_ACCOUNT_ID and ZOOM_PHONE_CLIENT_ID and ZOOM_PHONE_CLIENT_SECRET):
        return None
    creds = base64.b64encode(f"{ZOOM_PHONE_CLIENT_ID}:{ZOOM_PHONE_CLIENT_SECRET}".encode()).decode()
    r = requests.post(
        "https://zoom.us/oauth/token",
        params={"grant_type": "account_credentials", "account_id": ZOOM_ACCOUNT_ID},
        headers={"Authorization": f"Basic {creds}"},
        timeout=20
    )
    r.raise_for_status()
    return r.json().get("access_token")

def fetch_zoom():
    """Fetch Zoom Phone call logs and aggregate per-user outbound stats for the digest."""
    token = _zoom_token()
    if not token:
        print("  [SKIP] Zoom Phone credentials not configured")
        return {}
    print("Fetching Zoom Phone ...")
    h = {"Authorization": f"Bearer {token}"}

    # ── User metadata (extension number + department for filtering) ───────────
    user_meta = {}   # user_id → {"ext": str, "dept": str, "name": str}
    try:
        npt = None
        while True:
            p = {"page_size": 300}
            if npt:
                p["next_page_token"] = npt
            r = requests.get("https://api.zoom.us/v2/phone/users",
                             headers=h, params=p, timeout=30)
            if r.ok and r.status_code != 204:
                js = r.json()
                for u in js.get("users", []):
                    user_meta[u.get("id", "")] = {
                        "ext":  str(u.get("extension_number", "") or ""),
                        "dept": u.get("department", "") or "",
                        "name": u.get("name", "") or "",
                    }
                npt = js.get("next_page_token", "")
                if not npt:
                    break
            else:
                break
    except Exception as e:
        print(f"  [WARN] Zoom users: {e}")

    # Department allow-list (None = no filter)
    allowed_ids = None
    if ZOOM_DEPARTMENT and user_meta:
        allowed_ids = {uid for uid, m in user_meta.items()
                       if m["dept"].strip().lower() == ZOOM_DEPARTMENT.strip().lower()}

    # ── Paginate through all call log records MTD ─────────────────────────────
    all_calls = []
    npt = None
    while True:
        params = {
            "from": CUR_START.strftime("%Y-%m-%d"),
            "to":   TODAY.strftime("%Y-%m-%d"),
            "page_size": 300,
        }
        if npt:
            params["next_page_token"] = npt
        try:
            r = requests.get("https://api.zoom.us/v2/phone/call_logs",
                             headers=h, params=params, timeout=30)
            if r.status_code == 204:
                break
            r.raise_for_status()
            js = r.json()
            all_calls.extend(js.get("call_logs", []))
            npt = js.get("next_page_token", "")
            if not npt:
                break
        except Exception as e:
            print(f"  [WARN] Zoom call logs: {e}")
            break

    # ── Aggregate per user ────────────────────────────────────────────────────
    from collections import defaultdict
    # Zoom result values that indicate a live-answered call (duration > 0 required
    # to exclude "Call connected" ghost events where callee picked up then
    # immediately dropped — these have duration=0 and the Zoom portal does not
    # count them in Connected (OUT)).
    CONNECTED_RESULTS = {"Auto Recorded", "Call connected", "Recorded"}
    RECORDED_RESULTS  = {"Auto Recorded", "Recorded"}

    stats = defaultdict(lambda: {
        "outbound": 0, "connected": 0, "conn_dur": 0,
        "recorded": 0,                              # recorded outbound calls
        "total_calls": 0,                           # all directions
    })
    call_names = {}  # user_id → name from call log (fallback if user_meta missing)

    for call in all_calls:
        uid      = call.get("user_id", "")
        name     = call.get("user_name", "")
        direction= (call.get("direction") or "").lower()
        result   = call.get("result") or ""
        duration = int(call.get("duration") or 0)

        if not uid:
            continue
        if allowed_ids is not None and uid not in allowed_ids:
            continue
        if uid not in call_names and name:
            call_names[uid] = name

        stats[uid]["total_calls"] += 1

        if direction == "outbound":
            stats[uid]["outbound"] += 1
            # A call is "connected" if the result signals a live answer AND
            # duration > 0 (filters ghost pick-ups logged as "Call connected"
            # with 0 seconds — not counted by the Zoom portal either).
            if result in CONNECTED_RESULTS and duration > 0:
                stats[uid]["connected"] += 1
                stats[uid]["conn_dur"]  += duration
                if result in RECORDED_RESULTS:
                    stats[uid]["recorded"] += 1

    # Build the perf list (include all users in dept even if zero calls)
    seen_ids = set(stats.keys())
    if allowed_ids is not None:
        seen_ids |= allowed_ids   # include zero-call dept members

    perf_users = []
    for uid in seen_ids:
        if not uid:
            continue
        meta  = user_meta.get(uid, {})
        name  = meta.get("name") or call_names.get(uid, uid)
        ext   = meta.get("ext", "")
        s     = stats[uid]
        out   = s["outbound"]
        conn  = s["connected"]
        avg_s = (s["conn_dur"] // conn) if conn > 0 else 0
        perf_users.append({
            "name":                     name,
            "extension_number":         ext,
            "outbound_calls":           out,
            "connected_outbound_calls": conn,
            "avg_call_time":            avg_s,
            "recorded_calls":           s["recorded"],
        })

    perf_users.sort(key=lambda u: -u["outbound_calls"])
    active = [u for u in perf_users if u["outbound_calls"] > 0]

    # ── Team-level recording summary (derived from call logs) ─────────────────
    total_conn_out  = sum(u["connected_outbound_calls"] for u in perf_users)
    total_recorded  = sum(u["recorded_calls"]           for u in perf_users)
    rec_summary = {
        "total_connected_calls": total_conn_out,
        "recorded_calls":        total_recorded,
        # individual user recording config unknown from call logs — set to None
        "users_configured_auto_recording": None,
        "total_users":                     len([u for u in perf_users if u["outbound_calls"] > 0]),
    }

    print(f"  {len(all_calls)} call records → {len(perf_users)} users ({len(active)} active), "
          f"recorded {total_recorded}/{total_conn_out} connected")
    return {"perf": perf_users, "rec": rec_summary,
            "perf_from": CUR_START, "rec_from": CUR_START}


# ── ZOOM QUALITY ANALYSIS HELPERS ─────────────────────────────────────────────
def _parse_transcript(tr_json):
    """Parse Zoom transcript JSON into [(speaker, text)] turns."""
    turns = []
    try:
        timeline = tr_json.get("timeline", []) if isinstance(tr_json, dict) else []
        for item in timeline:
            username = item.get("username", "Unknown")
            text = item.get("text", "").strip()
            if text:
                turns.append((username, text))
    except Exception:
        pass
    return turns


def _analyze_transcripts_heuristic(transcripts, bd_name):
    """Rule-based 5-dimension skill scoring — no external API required."""
    all_bd_words, all_cust_words, all_bd_text = [], [], []

    SOFT_SET  = {"please","thank","thanks","sorry","appreciate","understand","wonderful",
                 "sure","certainly","absolutely","namaste","theek","bilkul","zaroor","shukriya",
                 "happy","glad","fantastic","great","respect","apologies","definitely","of course",
                 "no problem","helpful","kind","warmly","pleasure","patient"}
    BRAND_SET = {"olive","open","spark","hilton","oliveliving","brand","chain","group",
                 "hotel","property","resort","owner","management","operator","contract",
                 "franchise","affiliation","agreement","inventory","rooms","occupancy",
                 "revenue","commission","gds","ota","booking","support","training","technology",
                 "hospitality","partner","partnership","portfolio","network"}
    PITCH_SET = {"value","benefit","advantage","offer","solution","provide","help",
                 "grow","increase","improve","boost","maximize","earn","save","return",
                 "roi","profit","income","business","market","reach","exposure","visibility",
                 "channel","distribution","platform","system","dashboard","reporting",
                 "analytics","why","because","means","feature","service","package"}
    SALES_SET = {"interested","not interested","objection","concern","issue","problem",
                 "challenge","budget","price","cost","expensive","affordable","competitor",
                 "comparison","think","consider","decide","convince","explain","clarify",
                 "address","handle","overcome","worried","hesitant","doubt","trust"}
    CONV_SET  = {"send","share","whatsapp","email","meeting","visit","schedule","appointment",
                 "tomorrow","next","follow","connect","discuss","proposal","decision","agree",
                 "deal","confirm","brochure","details","callback","availability","proceed",
                 "yes","let","date","time","when","coming","next step","moving forward"}
    CONV_SIGNALS = {"send me","share details","schedule a","let's meet","we'll proceed","sounds good",
                    "interested to","agreed","confirmed","let me check","i'll get back","please send",
                    "whatsapp me","send on whatsapp","send the brochure","next steps","follow up"}
    DROP_SIGNALS = {"not interested","not right now","not looking","busy right now","call me later",
                    "already have","try someone else","don't have time","no need","not required",
                    "already tied up","will think","will call back","not sure","later","bye"}

    for t in transcripts:
        for speaker, text in _parse_transcript(t.get("text", {})):
            words = text.lower().split()
            tl = text.lower()
            if bd_name.lower() in speaker.lower():
                all_bd_words.extend(words)
                all_bd_text.append(tl)
            else:
                all_cust_words.extend(words)

    bw, cw = len(all_bd_words), len(all_cust_words)
    ratio   = bw / (bw + cw) if (bw + cw) > 0 else 0.5
    bw_safe = max(bw, 1)

    soft_r  = sum(1 for w in all_bd_words if w in SOFT_SET)  / bw_safe
    brand_r = sum(1 for w in all_bd_words if w in BRAND_SET) / bw_safe
    pitch_r = sum(1 for w in all_bd_words if w in PITCH_SET) / bw_safe
    sales_r = sum(1 for w in all_bd_words if w in SALES_SET) / bw_safe
    conv_r  = sum(1 for w in all_bd_words if w in CONV_SET)  / bw_safe

    def to_score(r, threshold):
        return round(min(10.0, r / threshold * 10), 1)

    scores = {
        "soft_skills":       to_score(soft_r,  0.08),
        "brand_alignment":   to_score(brand_r, 0.06),
        "pitch_skills":      to_score(pitch_r, 0.06),
        "sales_skills":      to_score(sales_r, 0.04),
        "conversion_skills": to_score(conv_r,  0.05),
    }

    # Detect conversion / drop-off signals from BD utterances
    full_bd = " ".join(all_bd_text)
    full_all = " ".join(all_bd_text + [" ".join(all_cust_words)])
    conv_found = [s for s in CONV_SIGNALS if s in full_all][:3]
    drop_found = [s for s in DROP_SIGNALS if s in full_all][:3]

    # Coaching narrative
    strengths, improvements = [], []
    if 0.35 <= ratio <= 0.60: strengths.append("balanced talk ratio")
    elif ratio > 0.65:        improvements.append("talk less, listen more")
    else:                     strengths.append("good listening skills")

    if scores["soft_skills"] >= 6:      strengths.append("strong rapport & warmth")
    else:                               improvements.append("build more rapport early in call")
    if scores["brand_alignment"] >= 6:  strengths.append("clear Olive brand alignment")
    else:                               improvements.append("reference Olive brand value more")
    if scores["pitch_skills"] >= 6:     strengths.append("articulates value well")
    else:                               improvements.append("articulate property benefits clearly")
    if scores["sales_skills"] >= 6:     strengths.append("handles objections confidently")
    else:                               improvements.append("address prospect objections directly")
    if scores["conversion_skills"] >= 6: strengths.append("closes with clear next step")
    else:                               improvements.append("always close with a concrete next step")

    if strengths and improvements:
        insight = f"Strong: {strengths[0]}. Priority focus: {improvements[0]}."
    elif strengths:
        insight = f"Performing well: {strengths[0]} and {strengths[1] if len(strengths)>1 else 'overall engagement'}. Continue pushing for explicit next steps."
    elif improvements:
        insight = f"Key coaching areas: {improvements[0]} and {improvements[1] if len(improvements)>1 else 'call structure'}."
    else:
        insight = "Review transcripts manually for deeper coaching signals."

    return {
        "insight": insight,
        "strength": strengths[0] if strengths else "—",
        "improve": improvements[0] if improvements else "—",
        "soft_skills":       scores["soft_skills"],
        "brand_alignment":   scores["brand_alignment"],
        "pitch_skills":      scores["pitch_skills"],
        "sales_skills":      scores["sales_skills"],
        "conversion_skills": scores["conversion_skills"],
        "talk_ratio":        round(ratio, 2),
        "conversion_signals": conv_found,
        "dropoff_signals":   drop_found,
        "transcripts_analyzed": len(transcripts),
        "ai_powered": False,
    }


def _analyze_transcripts_ai(transcripts, bd_name, api_key):
    """AI 5-dimension skill analysis via Anthropic Claude Haiku."""
    try:
        import anthropic as _ant
        parts = []
        for i, t in enumerate(transcripts[:10]):
            turns = _parse_transcript(t.get("text", {}))
            conv  = "\n".join(f"[{s}]: {x}" for s, x in turns[:100])
            parts.append(f"--- Call {i+1} ({t.get('duration',0)}s) ---\n{conv}")
        prompt = (
            f"You are a senior sales coach at Olive Living India — a hospitality brand that partners "
            f"with independent hotel/property owners (asset-light model). Review these MTD outbound "
            f"partnership sales calls by {bd_name}:\n\n"
            f"{''.join(parts)}\n\n"
            f"Score each dimension 0–10 (0=absent, 5=adequate, 10=excellent). "
            f"Identify specific observed phrases that drove progress AND caused disengagement.\n\n"
            f"Respond ONLY with valid JSON (no markdown, no extra keys):\n"
            f'{{"soft_skills":6.5,'
            f'"brand_alignment":7.0,'
            f'"pitch_skills":6.0,'
            f'"sales_skills":5.5,'
            f'"conversion_skills":6.0,'
            f'"insight":"2-3 sentence coaching narrative: what patterns you observed, what works, what to fix — be specific to their calls",'
            f'"strength":"one specific observed strength (max 7 words)",'
            f'"improve":"one highest-priority improvement (max 7 words)",'
            f'"conversion_signals":["phrase or behaviour that moved deal forward"],'
            f'"dropoff_signals":["phrase or behaviour that caused disengagement or hang-up"]}}'
        )
        client = _ant.Anthropic(api_key=api_key)
        msg    = client.messages.create(
            model="claude-haiku-4-5-20251001", max_tokens=500,
            messages=[{"role": "user", "content": prompt}]
        )
        import json as _j
        raw = msg.content[0].text.strip().strip('`').lstrip('json').strip()
        result = _j.loads(raw)
        # Ensure required keys exist with defaults
        for k, v in [("soft_skills",5.0),("brand_alignment",5.0),("pitch_skills",5.0),
                     ("sales_skills",5.0),("conversion_skills",5.0),
                     ("conversion_signals",[]),("dropoff_signals",[])]:
            result.setdefault(k, v)
        result["transcripts_analyzed"] = len(transcripts)
        result["ai_powered"] = True
        return result
    except Exception as e:
        print(f"  [WARN] AI analysis ({bd_name}): {e}")
        return _analyze_transcripts_heuristic(transcripts, bd_name)


def fetch_zoom_quality(df=None):
    """Enhanced Zoom fetch: MTD call stats + lead coverage + recording quality analysis.
    Activated via ZOOM_QUALITY_MODE=true in .env. Safe to run alongside existing fetch_zoom().
    """
    token = _zoom_token()
    if not token:
        print("  [SKIP] Zoom credentials not configured")
        return {}
    print("Fetching Zoom Phone (quality mode) ...")
    h = {"Authorization": f"Bearer {token}"}

    # ── User metadata ──────────────────────────────────────────────────────────
    user_meta = {}
    try:
        npt = None
        while True:
            p = {"page_size": 300}
            if npt: p["next_page_token"] = npt
            r = requests.get("https://api.zoom.us/v2/phone/users", headers=h, params=p, timeout=30)
            if r.ok and r.status_code != 204:
                js = r.json()
                for u in js.get("users", []):
                    user_meta[u.get("id", "")] = {
                        "ext":  str(u.get("extension_number", "") or ""),
                        "dept": u.get("department", "") or "",
                        "name": u.get("name", "") or "",
                    }
                npt = js.get("next_page_token", "")
                if not npt: break
            else: break
    except Exception as e:
        print(f"  [WARN] Zoom users: {e}")

    allowed_ids  = None
    bd_names_set = set()
    if ZOOM_DEPARTMENT and user_meta:
        allowed_ids  = {uid for uid, m in user_meta.items()
                        if m["dept"].strip().lower() == ZOOM_DEPARTMENT.strip().lower()}
        bd_names_set = {user_meta[uid]["name"].lower() for uid in allowed_ids
                        if user_meta[uid]["name"]}

    # ── Phone → lead lookup (for TAT + lead matching) ────────────────────────
    lead_phones   = set()
    phone_to_date = {}   # phone → earliest lead entry datetime
    if df is not None and not df.empty and "_phone" in df.columns:
        lead_phones = set(df["_phone"].dropna()) - {""}
        if "_date" in df.columns:
            for _, row in df.iterrows():
                ph = str(row.get("_phone") or "").strip()
                dt = row.get("_date")
                if ph and dt and pd.notna(dt):
                    if ph not in phone_to_date or dt < phone_to_date[ph]:
                        phone_to_date[ph] = dt

    # ── Paginate call logs (MTD) ───────────────────────────────────────────────
    from collections import defaultdict
    from datetime import datetime as _dt
    CONNECTED = {"Auto Recorded", "Call connected", "Recorded"}
    RECORDED  = {"Auto Recorded", "Recorded"}
    all_calls = []
    npt = None
    while True:
        params = {"from": CUR_START.strftime("%Y-%m-%d"), "to": TODAY.strftime("%Y-%m-%d"),
                  "page_size": 300}
        if npt: params["next_page_token"] = npt
        try:
            r = requests.get("https://api.zoom.us/v2/phone/call_logs",
                             headers=h, params=params, timeout=30)
            if r.status_code == 204: break
            r.raise_for_status()
            js = r.json()
            all_calls.extend(js.get("call_logs", []))
            npt = js.get("next_page_token", "")
            if not npt: break
        except Exception as e:
            print(f"  [WARN] Call logs: {e}"); break

    # ── Aggregate stats + lead coverage + durations + TAT ─────────────────────
    stats = defaultdict(lambda: {
        "outbound":0,"connected":0,"conn_dur":0,"recorded":0,
        "total_calls":0,"lead_calls":0,"lead_phones":set(),
        "durations":[],   # individual connected call durations (secs)
        "tat_hours":[],   # hours from lead entry to first outbound call per lead
        "lead_first_call":{},  # phone → earliest call datetime (for TAT dedup)
        "ghost_calls":0,  # outbound connected calls with duration=0 (<60s pick-up+drop)
    })
    call_names = {}
    for call in all_calls:
        uid      = call.get("user_id", "")
        name     = call.get("user_name", "")
        direction= (call.get("direction") or "").lower()
        result   = call.get("result") or ""
        duration = int(call.get("duration") or 0)
        callee   = norm_phone(call.get("callee_number", "") or "")
        call_dt_str = call.get("date_time", "")
        if not uid: continue
        if allowed_ids is not None and uid not in allowed_ids: continue
        if uid not in call_names and name: call_names[uid] = name
        stats[uid]["total_calls"] += 1
        if direction == "outbound":
            stats[uid]["outbound"] += 1
            if result in CONNECTED and duration > 0:
                stats[uid]["connected"] += 1
                stats[uid]["conn_dur"]  += duration
                stats[uid]["durations"].append(duration)
                if result in RECORDED: stats[uid]["recorded"] += 1
            elif result in CONNECTED and duration == 0:
                stats[uid]["ghost_calls"] += 1  # pick-up + immediate drop
            if callee and callee in lead_phones:
                stats[uid]["lead_calls"]  += 1
                stats[uid]["lead_phones"].add(callee)
                # TAT: compute hours from lead entry to this call (use first call per lead)
                if callee in phone_to_date and call_dt_str:
                    try:
                        call_dt = _dt.fromisoformat(call_dt_str.replace("Z", "+00:00")).replace(tzinfo=None)
                        lead_dt = phone_to_date[callee]
                        tat_h   = (call_dt - lead_dt).total_seconds() / 3600
                        # Only count if positive and not already logged (track first call)
                        if tat_h >= 0:
                            prev = stats[uid]["lead_first_call"].get(callee)
                            if prev is None or call_dt < prev:
                                stats[uid]["lead_first_call"][callee] = call_dt
                                # Remove old TAT for this lead if re-computed
                                stats[uid]["tat_hours"].append(tat_h)
                    except Exception:
                        pass

    seen_ids = set(stats.keys())
    if allowed_ids is not None: seen_ids |= allowed_ids

    perf_users = []
    for uid in seen_ids:
        if not uid: continue
        meta = user_meta.get(uid, {})
        name = meta.get("name") or call_names.get(uid, uid)
        ext  = meta.get("ext", "")
        s    = stats[uid]
        out, conn = s["outbound"], s["connected"]
        durs   = s["durations"]
        avg_s  = (sum(durs) // len(durs)) if durs else 0
        long_c = sum(1 for d in durs if d >= 180)   # calls ≥ 3 min
        tats   = s["tat_hours"]
        avg_tat = (sum(tats) / len(tats)) if tats else None
        perf_users.append({
            "name": name, "extension_number": ext,
            "outbound_calls": out, "connected_outbound_calls": conn,
            "avg_call_time": avg_s,
            "long_calls": long_c,
            "long_call_pct": pct(long_c, conn),
            "recorded_calls": s["recorded"],
            "lead_calls": s["lead_calls"],
            "unique_leads_called": len(s["lead_phones"]),
            "avg_tat_hours": avg_tat,
            "max_tat_hours": max(s["tat_hours"]) if s["tat_hours"] else None,
            "ghost_calls": s["ghost_calls"],
        })
    perf_users.sort(key=lambda u: -u["outbound_calls"])
    active = [u for u in perf_users if u["outbound_calls"] > 0]

    total_conn_out = sum(u["connected_outbound_calls"] for u in perf_users)
    total_recorded = sum(u["recorded_calls"]           for u in perf_users)
    all_lead_phones_called = set()
    for uid in seen_ids:
        if uid in stats: all_lead_phones_called |= stats[uid]["lead_phones"]

    rec_summary   = {"total_connected_calls": total_conn_out, "recorded_calls": total_recorded,
                     "users_configured_auto_recording": None, "total_users": len(active)}
    lead_coverage = {"total_leads_in_sheet": len(lead_phones),
                     "leads_called": len(all_lead_phones_called)}

    # ── Recordings + transcript quality (MTD — same window as call logs) ────────
    rec_from = CUR_START
    quality  = {}
    try:
        all_recs, npt = [], None
        while True:
            rp = {"from": rec_from.strftime("%Y-%m-%d"), "to": TODAY.strftime("%Y-%m-%d"),
                  "page_size": 300}
            if npt: rp["next_page_token"] = npt
            rr = requests.get("https://api.zoom.us/v2/phone/recordings",
                              headers=h, params=rp, timeout=30)
            if rr.status_code == 204: break
            rr.raise_for_status()
            rjs = rr.json()
            all_recs.extend(rjs.get("recordings", []))
            npt = rjs.get("next_page_token", "")
            if not npt: break

        bd_recs = defaultdict(list)
        for rec in all_recs:
            owner = rec.get("owner", {})
            oname = (owner.get("name", "") if isinstance(owner, dict) else "") or ""
            if (rec.get("direction", "").lower() != "outbound"
                    or not rec.get("transcript_download_url")
                    or int(rec.get("duration", 0) or 0) < 30): continue
            if bd_names_set and oname.lower() not in bd_names_set: continue
            bd_recs[oname].append({
                "duration":       int(rec.get("duration", 0)),
                "transcript_url": rec["transcript_download_url"],
                "date":           rec.get("date_time", ""),
            })

        # Collect all (bd_name, rec_item) pairs to download in parallel
        download_tasks = []
        for bd_name, recs in bd_recs.items():
            for rec_item in sorted(recs, key=lambda x: -x["duration"])[:10]:
                download_tasks.append((bd_name, rec_item))

        def _fetch_transcript(task):
            bd_name, rec_item = task
            try:
                tr = requests.get(rec_item["transcript_url"], headers=h, timeout=20)
                if tr.ok:
                    return bd_name, {"text": tr.json(), "duration": rec_item["duration"]}
            except Exception as te:
                print(f"  [WARN] transcript ({bd_name}): {te}")
            return bd_name, None

        import concurrent.futures as _cf
        bd_transcripts = defaultdict(list)
        with _cf.ThreadPoolExecutor(max_workers=6) as ex:
            for bd_name, result in ex.map(_fetch_transcript, download_tasks):
                if result:
                    bd_transcripts[bd_name].append(result)

        # Build canonical name lookup: normalised-lower → canonical name from user_meta
        canonical_names = {m["name"].strip().lower(): m["name"].strip()
                           for m in user_meta.values() if m.get("name")}

        def _canonical(raw_name):
            """Map recording owner name → canonical perf user name (best-effort)."""
            rl = raw_name.strip().lower()
            if rl in canonical_names:
                return canonical_names[rl]
            # Try first+last word match
            parts = rl.split()
            if len(parts) >= 2:
                for cname_l, cname in canonical_names.items():
                    cp = cname_l.split()
                    if parts[0] == cp[0] and parts[-1] == cp[-1]:
                        return cname
            # Try first-name match only
            for cname_l, cname in canonical_names.items():
                if cname_l.split()[0] == parts[0]:
                    return cname
            return raw_name.strip()   # fallback: use as-is

        for bd_name, transcripts in bd_transcripts.items():
            if not transcripts: continue
            scores = (_analyze_transcripts_ai(transcripts, bd_name, ANTHROPIC_API_KEY)
                      if ANTHROPIC_API_KEY else
                      _analyze_transcripts_heuristic(transcripts, bd_name))
            canon = _canonical(bd_name)
            quality[canon] = {"name": canon, "recordings_analyzed": len(transcripts), **scores}

        print(f"  Recordings: {len(all_recs)} total → quality analyzed {len(quality)} BD(s)")
    except Exception as e:
        print(f"  [WARN] recording quality: {e}")

    print(f"  {len(all_calls)} call records → {len(perf_users)} users ({len(active)} active), "
          f"recorded {total_recorded}/{total_conn_out} connected")
    return {"perf": perf_users, "rec": rec_summary,
            "perf_from": CUR_START, "rec_from": CUR_START,
            "lead_coverage": lead_coverage, "quality": quality}


# ── Helpers ───────────────────────────────────────────────────────────────────
def gmtd(df, col="_date"):
    if df.empty: return df
    s=pd.Timestamp(CUR_START); e=pd.Timestamp(CUR_END)+timedelta(days=1)
    return df[(df[col].notna())&(df[col]>=s)&(df[col]<e)]
def gprev(df, col="_date"):
    if df.empty: return df
    s=pd.Timestamp(PREV_START); e=pd.Timestamp(PREV_END)+timedelta(days=1)
    return df[(df[col].notna())&(df[col]>=s)&(df[col]<e)]
def pct(n,d): return round(n/d*100,1) if d else 0
def pcts(n,d): return f"{pct(n,d):.1f}%"
def fmt(n): return f"{n:,}"
def delta(now,prev):
    if not prev: return ""
    d=now-prev; p=abs(d)/prev*100
    col="#22c55e" if d>=0 else "#ef4444"
    return f'<span style="font-size:11px;color:{col};font-weight:600">{"+" if d>=0 else ""}{d:,} ({p:.1f}%) vs last month</span>'

# ── SVG Charts ────────────────────────────────────────────────────────────────
import math

def svg_donut(segments, size=140, hole=0.6, label="", sublabel=""):
    """segments = [(value, color, name), ...]"""
    total = sum(s[0] for s in segments)
    if not total: return ""
    cx = cy = size/2; r = size/2 - 8; ri = r*hole
    stroke = r - ri; mr = (r+ri)/2
    circ = 2*math.pi*mr
    paths = []; offset = 0
    for val,color,name in segments:
        p = val/total; arc = p*circ
        if arc < 0.5: offset += arc; continue
        d_str = f'{arc:.2f} {circ:.2f}'
        rot = offset/circ*360 - 90
        paths.append(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{mr:.1f}" fill="none" stroke="{color}" '
                     f'stroke-width="{stroke:.1f}" stroke-dasharray="{d_str}" '
                     f'transform="rotate({rot:.1f} {cx:.1f} {cy:.1f})"/>')
        offset += arc
    center = ""
    if label:
        center += f'<text x="{cx:.1f}" y="{cy-6:.1f}" text-anchor="middle" font-size="18" font-weight="800" fill="#1a1a1a" font-family="Arial,sans-serif">{label}</text>'
    if sublabel:
        center += f'<text x="{cx:.1f}" y="{cy+14:.1f}" text-anchor="middle" font-size="10" fill="#94a3b8" font-family="Arial,sans-serif">{sublabel}</text>'
    return (f'<svg width="{size}" height="{size}" viewBox="0 0 {size} {size}" xmlns="http://www.w3.org/2000/svg">'
            +f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{mr:.1f}" fill="none" stroke="#f1f5f9" stroke-width="{stroke:.1f}"/>'
            +"".join(paths)+center+"</svg>")

def svg_vbars(data, width=200, height=52, highlight_max=True):
    """data = [(label, value), ...]  — vertical bar chart"""
    if not data: return ""
    n=len(data); bw=max(1,(width-n*3)//n); mx=max(v for _,v in data) or 1
    bars=""; x=0
    for lbl,val in data:
        bh=max(3,int(val/mx*(height-14)))
        by=height-14-bh
        is_max=highlight_max and val==mx
        fill="#534AB7" if is_max else "#c7d2fe"
        bars+=(f'<rect x="{x}" y="{by}" width="{bw}" height="{bh}" fill="{fill}" rx="2"/>'
               f'<text x="{x+bw//2}" y="{height-2}" text-anchor="middle" font-size="8" fill="#94a3b8" font-family="Arial,sans-serif">{lbl}</text>')
        x+=bw+3
    return f'<svg width="{width}" height="{height}" viewBox="0 0 {width} {height}" xmlns="http://www.w3.org/2000/svg">{bars}</svg>'

def svg_hbar_row(label, val, total, color, h=10, sub=""):
    """Single labeled horizontal bar row."""
    p=val/total*100 if total else 0; w=max(1,p)
    sub_html=f' <span style="font-size:10px;color:#b0b8c4">{sub}</span>' if sub else ""
    return (f'<div style="margin-bottom:10px">'
            f'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">'
            f'<span style="font-size:12px;color:#334155">{label}</span>'
            f'<span style="font-size:12px;font-weight:700;color:#1e293b">{fmt(val)} <span style="font-size:10px;color:#94a3b8">({p:.1f}%)</span>{sub_html}</span></div>'
            f'<div style="background:#f1f5f9;border-radius:99px;height:{h}px;overflow:hidden">'
            f'<div style="background:{color};width:{w:.1f}%;height:{h}px;border-radius:99px"></div></div></div>')

def svg_funnel(stages, width=560):
    """stages = [(label, n, total, color), ...]"""
    if not stages: return ""
    bar_h=28; gap=6; svg_h=len(stages)*(bar_h+gap)+20
    mx=max(s[1] for s in stages) or 1
    rows=""
    for i,(lbl,n,total,color) in enumerate(stages):
        p=n/total*100 if total else 0
        w=max(8,int(n/mx*(width-160)))
        y=i*(bar_h+gap)+10
        rows+=(f'<rect x="0" y="{y}" width="{w}" height="{bar_h}" fill="{color}" rx="4" opacity="0.9"/>'
               f'<text x="{w+8}" y="{y+bar_h//2+1}" dominant-baseline="middle" font-size="11" fill="#334155" font-weight="600" font-family="Arial,sans-serif">{fmt(n)}</text>'
               f'<text x="{w+52}" y="{y+bar_h//2+1}" dominant-baseline="middle" font-size="10" fill="#94a3b8" font-family="Arial,sans-serif">({p:.1f}%)</text>'
               f'<text x="{width-4}" y="{y+bar_h//2+1}" dominant-baseline="middle" text-anchor="end" font-size="11" fill="#64748b" font-family="Arial,sans-serif">{lbl}</text>')
    return f'<svg width="{width}" height="{svg_h}" viewBox="0 0 {width} {svg_h}" xmlns="http://www.w3.org/2000/svg">{rows}</svg>'

def svg_gauge(val, lo, hi, invert=False, size=80):
    """Simple arc gauge."""
    safe_pct = max(0, min(100, (val-lo)/(hi-lo)*100 if hi!=lo else 0))
    if invert: safe_pct = 100 - safe_pct
    good = (val<=lo if invert else val>=hi)
    warn = (val<=hi if invert else val>=lo)
    color = "#22c55e" if good else ("#f59e0b" if warn else "#ef4444")
    # arc from -150deg to +150deg = 300deg total
    angle = -150 + safe_pct/100*300
    ar = math.radians(angle)
    cx=cy=size/2; r=size/2-8
    # end point
    ex=cx+r*math.cos(ar); ey=cy+r*math.sin(ar)
    lar=1 if safe_pct>50 else 0
    track=(f'<path d="M {cx+r*math.cos(math.radians(-150)):.1f} {cy+r*math.sin(math.radians(-150)):.1f} '
           f'A {r:.1f} {r:.1f} 0 1 1 {cx+r*math.cos(math.radians(150)):.1f} {cy+r*math.sin(math.radians(150)):.1f}" '
           f'fill="none" stroke="#f1f5f9" stroke-width="7" stroke-linecap="round"/>')
    arc=(f'<path d="M {cx+r*math.cos(math.radians(-150)):.1f} {cy+r*math.sin(math.radians(-150)):.1f} '
         f'A {r:.1f} {r:.1f} 0 {lar} 1 {ex:.1f} {ey:.1f}" '
         f'fill="none" stroke="{color}" stroke-width="7" stroke-linecap="round"/>')
    dot=f'<circle cx="{ex:.1f}" cy="{ey:.1f}" r="4" fill="{color}"/>'
    return (f'<svg width="{size}" height="{size*0.75:.0f}" viewBox="0 0 {size} {size*0.75:.0f}" xmlns="http://www.w3.org/2000/svg">'
            +track+arc+dot+"</svg>"), color

# ── Layout primitives ─────────────────────────────────────────────────────────
def sec_div(title, subtitle="", color="#534AB7"):
    return (f'<tr><td style="padding:28px 0 16px">'
            f'<div style="font-size:16px;font-weight:800;color:#1e293b;letter-spacing:-0.3px">'
            f'<span style="display:inline-block;width:4px;height:18px;background:{color};border-radius:2px;margin-right:10px;vertical-align:middle"></span>'
            f'{title}</div>'
            +(f'<div style="font-size:11px;color:#94a3b8;margin-top:3px;padding-left:14px">{subtitle}</div>' if subtitle else "")
            +'</td></tr>')

def rule(): return '<tr><td style="padding:0"><div style="height:1px;background:#f1f5f9"></div></td></tr>'

def cell2(left, right, gap=16):
    return (f'<table width="100%" cellpadding="0" cellspacing="0"><tr>'
            f'<td style="vertical-align:top;width:50%;padding-right:{gap}px">{left}</td>'
            f'<td style="vertical-align:top;width:50%">{right}</td>'
            f'</tr></table>')

def label(t):
    return f'<div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:8px">{t}</div>'

def kpi_card(val, title, sub="", color="#534AB7", bg="#f8fafc"):
    return (f'<div style="background:{bg};border-radius:8px;padding:16px;border-top:3px solid {color}">'
            f'<div style="font-size:20px;font-weight:900;color:{color};line-height:1.1;word-break:break-word">{val}</div>'
            f'<div style="font-size:11px;font-weight:600;color:#475569;margin-top:4px">{title}</div>'
            +(f'<div style="font-size:10px;color:#94a3b8;margin-top:2px">{sub}</div>' if sub else "")
            +'</div>')

def stat_row(label_s, val, sub=""):
    return (f'<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f8fafc">'
            f'<span style="font-size:12px;color:#475569">{label_s}</span>'
            f'<div style="text-align:right"><span style="font-size:13px;font-weight:700;color:#1e293b">{val}</span>'
            +(f' <span style="font-size:10px;color:#94a3b8">{sub}</span>' if sub else "")+'</div></div>')

def legend_dot(color, label_s, val, pct_v):
    return (f'<div style="display:flex;align-items:center;margin-bottom:6px">'
            f'<div style="width:8px;height:8px;border-radius:50%;background:{color};margin-right:8px;flex-shrink:0"></div>'
            f'<span style="font-size:11px;color:#475569;flex:1">{label_s}</span>'
            f'<span style="font-size:11px;font-weight:700;color:#1e293b">{val}</span>'
            f'<span style="font-size:10px;color:#94a3b8;margin-left:4px">({pct_v})</span></div>')

def insight_card(icon, title, body, color="#534AB7", bg="#f0eef9"):
    return (f'<div style="background:{bg};border-left:3px solid {color};padding:12px 16px;margin-bottom:10px;border-radius:0 6px 6px 0">'
            f'<div style="font-size:12px;font-weight:700;color:#1e293b;margin-bottom:3px">{icon} {title}</div>'
            f'<div style="font-size:11px;color:#475569;line-height:1.6">{body}</div></div>')

def owner_badge(eff):
    if eff>35: return f'<span style="background:#dcfce7;color:#166534;font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px">&#9733; {int(eff)}</span>'
    if eff>20: return f'<span style="background:#fef3c7;color:#92400e;font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px">&#9889; {int(eff)}</span>'
    return f'<span style="background:#fee2e2;color:#991b1b;font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px">&#9679; {int(eff)}</span>'

# ── BRIEFING BANNER ───────────────────────────────────────────────────────────
def build_briefing(dm, dp, crm_m, crm_p):
    tm=len(dm); tp=len(dp); cm=crm_m["_phone"].nunique() if not crm_m.empty else 0; cp=crm_p["_phone"].nunique() if not crm_p.empty else 0
    cr_m=len(crm_m[crm_m["Status"].isin(CONT_S)]) if not crm_m.empty else 0
    hot_m=len(crm_m[crm_m["Status"]=="Under Discussion"]) if not crm_m.empty else 0
    new_m=len(crm_m[crm_m["Status"]=="New Leads"]) if not crm_m.empty else 0
    kpis=[
        ("MTD LEADS",fmt(tm),""),
        ("CRM THIS MONTH",fmt(cm),""),
        ("CONTACTED",fmt(cr_m),""),
        ("IN DISCUSSION",fmt(hot_m),""),
        ("UNWORKED",fmt(new_m),'<div style="font-size:10px;color:#fca5a5;margin-top:3px">New stage</div>' if new_m>500 else ""),
    ]
    kpi_cells="".join(
        f'<td style="padding:0 24px 0 0;vertical-align:top">'
        f'<div style="font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;font-weight:600">{l}</div>'
        f'<div style="font-size:24px;font-weight:900;color:#fff;line-height:1.1;margin-top:4px">{v}</div>'
        f'{s}</td>'
        for l,v,s in kpis)
    alerts=[]
    if not crm_m.empty:
        sa=crm_m[crm_m["Owner"].str.lower().str.contains("super admin|admin.zoho",na=False)]
        if len(sa)>50: alerts.append(f'<b style="color:#fca5a5">{fmt(len(sa))} leads unassigned</b> (Super Admin) — redistribute now')
        for ow in crm_m["Owner"].unique():
            od=crm_m[crm_m["Owner"]==ow]
            if len(od)>=50 and len(od[od["Status"]=="Lead Dropped"])/len(od)>0.45:
                alerts.append(f'<b style="color:#fca5a5">{ow}</b>: {pcts(len(od[od["Status"]=="Lead Dropped"]),len(od))} drop rate this month')
    actions=[]
    if not crm_m.empty:
        sa_n=len(crm_m[crm_m["Owner"].str.lower().str.contains("super admin|admin.zoho",na=False)])
        if sa_n>30: actions.append(f'Reassign <b>{fmt(sa_n)}</b> Super Admin leads to active owners')
        if new_m>200: actions.append(f'First-contact push: <b>{fmt(new_m)}</b> new CRM leads untouched')
        if hot_m>0: actions.append(f'<b>{fmt(hot_m)}</b> leads in active discussion — follow up within 24h')
    if len(actions)<3: actions.append('Review previous month stale leads before they go cold')
    alerts_html=""
    if alerts:
        alerts_html=(f'<div style="border-top:1px solid rgba(255,255,255,0.08);margin-top:16px;padding-top:12px">'
                     f'<div style="font-size:9px;color:#f87171;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;margin-bottom:8px">Critical Alerts</div>'
                     +"".join(f'<div style="font-size:11px;color:#cbd5e1;margin-bottom:5px">&#x2022; {a}</div>' for a in alerts)
                     +'</div>')
    actions_html=(f'<div style="border-top:1px solid rgba(255,255,255,0.08);margin-top:12px;padding-top:12px">'
                  f'<div style="font-size:9px;color:#a5b4fc;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;margin-bottom:8px">Top 3 Actions Today</div>'
                  +"".join(f'<div style="font-size:11px;color:#cbd5e1;margin-bottom:5px"><span style="color:#a5b4fc;font-weight:700">{i+1}.</span> {a}</div>'
                           for i,a in enumerate(actions[:3]))
                  +'</div>')
    return (f'<tr><td style="padding-bottom:0">'
            f'<div style="background:linear-gradient(135deg,#0f172a 0%,#1e1b4b 100%);padding:28px 32px">'
            f'<div style="font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:0.1em;font-weight:700;margin-bottom:16px">'
            f'Daily Briefing &nbsp;&middot;&nbsp; {TODAY.strftime("%d %B %Y")}</div>'
            f'<table width="100%" cellpadding="0" cellspacing="0"><tr>{kpi_cells}</tr></table>'
            f'{alerts_html}{actions_html}'
            f'</div></td></tr>')

# ── KEY INSIGHTS ──────────────────────────────────────────────────────────────
def build_insights(dm, dp, crm_m=None, crm_p=None, bd_cards=""):
    tm=len(dm); tp=len(dp)
    cards=[]
    if tp:
        d=tm-tp; p=abs(d)/tp*100
        cards.append(insight_card("📈" if d>=0 else "📉",
            f"Volume {'up' if d>=0 else 'down'} {p:.1f}% vs last month",
            f"{fmt(tm)} vs {fmt(tp)} last month ({'+' if d>=0 else ''}{d:,}). "
            +("Check campaign budgets and ad creative refresh." if d<0 else "Strong momentum — maintain spend."),
            "#16a34a" if d>=0 else "#ef4444", "#f0fdf4" if d>=0 else "#fef2f2"))
    if tm:
        bc=dm["_brand"].value_counts(); top_b,top_n=bc.index[0],bc.iloc[0]
        q_b,q_n=bc.index[-1],bc.iloc[-1]
        cards.append(insight_card("🏆",f"{top_b} leads at {pcts(top_n,tm)}",
            f"{top_b} contributed {fmt(top_n)} leads. {q_b} is quietest at {fmt(q_n)} — review ad spend or creative mix."))
    if tm:
        op=len(dm[dm["_prop"]=="Operational"]); vl=len(dm[dm["_prop"]=="Vacant Land"])
        cards.append(insight_card("🏗️","Property mix drives conversion timeline",
            f"Operational {pcts(op,tm)} (fast-close) · Vacant land {pcts(vl,tm)} (long-cycle). "
            f"Prioritise {fmt(op)} operational leads for fastest onboarding.",
            "#16a34a","#f0fdf4"))
    kc=dm[dm["_city"].apply(is_real)]
    if len(kc):
        t1=len(kc[kc["_tier"]=="Tier 1"])
        cards.append(insight_card("🏙️","Tier 3 cities generate volume — Tier 1 converts best",
            f"Tier 1 = {pcts(t1,len(kc))} of named-city leads but shows <10% CRM drop rate. "
            f"Bengaluru, Pune, Hyderabad are your highest-quality markets."))
    # ── CRM pipeline insights ────────────────────────────────────────────────
    crm_cards = []
    if crm_m is not None and len(crm_m):
        total_m  = len(crm_m)
        new_m    = int((crm_m["Status"] == "New Leads").sum())
        worked   = total_m - new_m
        drop_m   = int((crm_m["Status"] == "Lead Dropped").sum())
        disc_m   = int((crm_m["Status"] == "Under Discussion").sum())
        crm_cards.append(insight_card("&#128203;",
            f"{pcts(worked, total_m)} of this month's CRM leads have been worked",
            f"{fmt(worked)} of {fmt(total_m)} leads moved past 'New' &mdash; {fmt(new_m)} are still untouched in the CRM. "
            f"{fmt(disc_m)} are in discussion/approval.",
            "#16a34a" if worked/total_m >= 0.6 else "#d97706",
            "#f0fdf4" if worked/total_m >= 0.6 else "#fffbeb"))
        if crm_p is not None and len(crm_p):
            dr_now, dr_prev = pct(drop_m, total_m), pct(int((crm_p["Status"]=="Lead Dropped").sum()), len(crm_p))
            trend = "down" if dr_now <= dr_prev else "up"
            crm_cards.append(insight_card("&#128201;" if trend=="up" else "&#128200;",
                f"Drop rate {dr_now:.0f}% ({trend} from {dr_prev:.0f}% last month)",
                f"{fmt(drop_m)} leads dropped this month.",
                "#ef4444" if trend=="up" else "#16a34a",
                "#fef2f2" if trend=="up" else "#f0fdf4"))

    def _sub(t):
        return (f'<tr><td style="padding:10px 0 6px"><div style="font-size:10px;font-weight:700;color:#94a3b8;'
                f'text-transform:uppercase;letter-spacing:0.07em">{t}</div></td></tr>')

    out = sec_div("Key Insights", f"{TODAY.strftime('%B %Y')} &middot; full-process review: lead generation &rarr; CRM pipeline &rarr; BD calling")
    out += _sub("1 &middot; Lead generation")
    out += "".join(f'<tr><td style="padding-bottom:2px">{c}</td></tr>' for c in cards)
    if crm_cards:
        out += _sub("2 &middot; Pipeline (CRM)")
        out += "".join(f'<tr><td style="padding-bottom:2px">{c}</td></tr>' for c in crm_cards)
    if bd_cards:
        out += _sub("3 &middot; BD team &middot; calling")
        out += f'<tr><td style="padding-bottom:2px">{bd_cards}</td></tr>'
    return out

# ── MTD SNAPSHOT ──────────────────────────────────────────────────────────────
def css_vbars(data, bar_h=48):
    """CSS-based vertical bar chart, email-safe."""
    if not data: return ""
    mx = max(v for _,v in data) or 1
    cells = "".join(
        f'<td style="vertical-align:bottom;text-align:center;padding:0 5px">'
        f'<div style="background:{"#534AB7" if v==mx else "#c7d2fe"};width:22px;height:{max(4,int(v/mx*bar_h))}px;border-radius:3px 3px 0 0;margin:0 auto"></div>'
        f'<div style="font-size:8px;color:#94a3b8;margin-top:4px">{l}</div></td>'
        for l,v in data)
    return f'<table cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr style="vertical-align:bottom">{cells}</tr></table>'

def css_hbars(segments):
    """CSS horizontal bars for brand/property split — email-safe."""
    total = sum(s[0] for s in segments) or 1
    rows = ""
    for val, color, name in segments:
        if val == 0: continue
        p = val/total*100
        rows += (f'<div style="margin-bottom:9px">'
                 f'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">'
                 f'<span style="font-size:11px;color:#334155">'
                 f'<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:{color};margin-right:6px;vertical-align:middle"></span>{name}</span>'
                 f'<span style="font-size:11px;font-weight:700;color:#1e293b">{fmt(val)} <span style="font-size:10px;color:#94a3b8">({p:.1f}%)</span></span></div>'
                 f'<div style="background:#f1f5f9;border-radius:99px;height:8px;overflow:hidden">'
                 f'<div style="background:{color};width:{p:.1f}%;height:8px;border-radius:99px"></div></div></div>')
    return rows

def build_mtd(dm, dp):
    tm=len(dm); tp=len(dp)
    # Period-aware trend bars
    if PERIOD == "day":
        trend_data = [(f"{h:02d}h", len(dm[dm["_date"].dt.hour==h])) for h in range(0,24,3)]
    elif PERIOD == "week":
        _days=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]
        trend_data = [(_days[d], len(dm[dm["_date"].dt.weekday==d])) for d in range(7)]
    elif PERIOD == "quarter":
        _qm = [(CUR_START.month+i) for i in range(3) if (CUR_START.month+i)<=12]
        trend_data = [(date(CUR_START.year,m,1).strftime("%b"), len(dm[dm["_date"].dt.month==m])) for m in _qm]
    elif PERIOD == "year":
        trend_data = [(date(TODAY.year,m,1).strftime("%b"), len(dm[dm["_date"].dt.month==m])) for m in range(1,13)]
    else:  # month
        _sub=dm.copy(); _sub["_wk"]=_sub["_date"].dt.day.apply(lambda d:min((d-1)//7+1,4))
        trend_data = [(f"W{w}", len(_sub[_sub["_wk"]==w])) for w in range(1,5)]
    spark=css_vbars(trend_data)
    wks = {l:v for l,v in trend_data}
    # Brand bars (CSS)
    brand_segs=[(len(dm[dm["_brand"]==b]),BRAND_COLOR.get(b,"#666"),BRAND_DISPLAY.get(b,b)) for b in BRANDS]
    brand_bars=css_hbars(brand_segs)
    # Property bars (CSS)
    prop_data=[("Vacant Land","#f59e0b"),("Operational","#22c55e"),("Under Construction","#3b82f6")]
    prop_segs=[(len(dm[dm["_prop"]==p]),c,p) for p,c in prop_data]
    prop_bars=css_hbars(prop_segs)
    # Key signals — top state + top city only (no count delta)
    rc=dm[dm["_city"].apply(is_real)]["_city"].value_counts()
    ts=dm[dm["_state"].str.len()>1]["_state"].value_counts()
    prop_top = max(prop_segs, key=lambda x: x[0])
    signals=(f'<table width="100%" cellpadding="0" cellspacing="0"><tr>'
             +f'<td style="padding-right:16px;vertical-align:top">'
             +kpi_card(ts.index[0] if len(ts) else "—","Top State",f'{fmt(ts.iloc[0])} leads' if len(ts) else "","#7c3aed","#faf5ff")
             +f'</td><td style="padding-right:16px;vertical-align:top">'
             +kpi_card(rc.index[0] if len(rc) else "—","Top City (Named)",f'{city_tier(rc.index[0])} · {city_type(rc.index[0])}' if len(rc) else "","#0891b2","#f0f9ff")
             +f'</td><td style="vertical-align:top">'
             +kpi_card(prop_top[2],"Top Lead Type",f'{prop_top[0]:,} leads ({prop_top[0]/tm*100:.1f}%)' if tm else "","#d97706","#fffbeb")
             +'</td></tr></table>')
    # Weekly trend row
    trend_row=(f'<div style="margin-bottom:20px">'
               +label(f"Trend — {_P_SHORT}")
               +f'<table width="100%" cellpadding="0" cellspacing="0"><tr>'
               +f'<td style="vertical-align:bottom">{spark}</td>'
               +f'<td style="vertical-align:bottom;padding-left:16px">'
               +f'<div style="font-size:10px;color:#94a3b8">'
               +''.join(f'<div style="margin-bottom:2px">{l}: <b style="color:#334155">{fmt(v)}</b></div>' for l,v in trend_data)
               +'</div></td></tr></table></div>')
    # Brand + property side by side
    split_row=(f'<table width="100%" cellpadding="0" cellspacing="0"><tr>'
               +f'<td style="width:50%;vertical-align:top;padding-right:20px">'
               +label("Brand Split")+brand_bars
               +'</td>'
               +f'<td style="width:50%;vertical-align:top">'
               +label("Property Mix")+prop_bars
               +'</td></tr></table>')
    body=trend_row+split_row+f'<div style="margin-top:20px">{signals}</div>'
    return (sec_div("Lead Generation",_P_LABEL)
            +f'<tr><td style="padding-bottom:16px">{body}</td></tr>')

# ── DEEP BREAKDOWN ─────────────────────────────────────────────────────────────
def build_deep(dm, dp):
    # Brand × Property table
    props=[("Vacant Land","#f59e0b"),("Operational","#22c55e"),("Under Construction","#3b82f6")]
    tbl_hdr=(f'<tr style="border-bottom:2px solid #f1f5f9">'
             +f'<th style="font-size:10px;color:#94a3b8;text-align:left;padding:6px 0;font-weight:600;text-transform:uppercase;letter-spacing:0.06em">Property</th>'
             +"".join(f'<th style="font-size:10px;color:#94a3b8;text-align:right;padding:6px 8px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em">'
                      f'<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:{BRAND_COLOR.get(b,"#666")};margin-right:4px;vertical-align:middle"></span>'
                      f'{BRAND_DISPLAY.get(b,b).replace(" Hotels","").replace(" by Hilton","")}</th>' for b in BRANDS)
             +'</tr>')
    tbl_rows="".join(
        f'<tr style="border-bottom:1px solid #f8fafc">'
        +f'<td style="font-size:12px;color:#475569;padding:8px 0"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:{c};margin-right:6px;vertical-align:middle"></span>{p}</td>'
        +"".join(f'<td style="font-size:12px;font-weight:600;color:#1e293b;text-align:right;padding:8px">{fmt(len(dm[(dm["_brand"]==b)&(dm["_prop"]==p)]))}</td>'
                 for b in BRANDS)
        +'</tr>'
        for p,c in props if any(len(dm[(dm["_brand"]==b)&(dm["_prop"]==p)])>0 for b in BRANDS))
    prop_tbl=f'<table width="100%" cellpadding="0" cellspacing="0">{tbl_hdr+tbl_rows}</table>'
    # Top states bars
    sdf=dm[dm["_state"].str.len()>1]["_state"].value_counts().head(8)
    state_bars="".join(svg_hbar_row(f"{i+1}. {s}",n,len(dm),"#534AB7") for i,(s,n) in enumerate(sdf.items()))
    # Top cities with tier badge
    rc=dm[dm["_city"].apply(is_real)]["_city"].value_counts().head(10)
    city_rows="".join(
        f'<tr style="border-bottom:1px solid #f8fafc">'
        f'<td style="font-size:12px;color:#334155;padding:7px 0">{c}</td>'
        f'<td style="padding:7px 4px"><span style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:10px;background:{"#ede9fe" if city_tier(c)=="Tier 1" else "#e0f2fe" if city_tier(c)=="Tier 2" else "#f1f5f9"};color:{"#5b21b6" if city_tier(c)=="Tier 1" else "#0369a1" if city_tier(c)=="Tier 2" else "#64748b"}">{city_tier(c)}</span></td>'
        f'<td style="font-size:11px;color:#94a3b8;padding:7px 4px">{city_type(c)}</td>'
        f'<td style="font-size:12px;font-weight:700;color:#1e293b;text-align:right;padding:7px 0">{fmt(n)}</td>'
        f'</tr>'
        for c,n in rc.items())
    city_tbl=f'<table width="100%" cellpadding="0" cellspacing="0">{city_rows}</table>'
    body=(label("Brand × Property Status (MTD)")
          +prop_tbl
          +f'<div style="margin-top:20px">'
          +cell2(label("Top States")+state_bars, label("Top Cities (Named)")+city_tbl)
          +'</div>')
    return sec_div("Geographic & Property Breakdown","MTD data")+f'<tr><td style="padding-bottom:16px">{body}</td></tr>'

# ── BRAND INTELLIGENCE ─────────────────────────────────────────────────────────
def build_brands(dm, dp):
    def one_liner(bm,nm):
        op=len(bm[bm["_prop"]=="Operational"])/nm*100 if nm else 0
        vl=len(bm[bm["_prop"]=="Vacant Land"])/nm*100 if nm else 0
        if op>35: return f"Strong operational mix ({op:.0f}%) — fastest to convert."
        if vl>55: return f"Vacant land heavy ({vl:.0f}%) — needs construction-track follow-up."
        return "Balanced property mix."
    sections=[]
    for b in BRANDS:
        bm=dm[dm["_brand"]==b]; bp=dp[dp["_brand"]==b]
        nm=len(bm); np_=len(bp); c=BRAND_COLOR.get(b,"#666"); bg=BRAND_LIGHT.get(b,"#f8fafc")
        props=[("Vacant Land","#f59e0b"),("Operational","#22c55e"),("Under Construction","#3b82f6")]
        prop_bars="".join(svg_hbar_row(p,len(bm[bm["_prop"]==p]),nm,col)
            for p,col in props if len(bm[bm["_prop"]==p])>0)
        kc=bm[bm["_city"].apply(is_real)]; nk=len(kc)
        tier_str=f'T1 {pcts(len(kc[kc["_tier"]=="Tier 1"]),nk)} · T2 {pcts(len(kc[kc["_tier"]=="Tier 2"]),nk)} · T3 {pcts(len(kc[kc["_tier"]=="Tier 3"]),nk)}'
        top_s=bm[bm["_state"].str.len()>1]["_state"].value_counts().head(5)
        rc=bm[bm["_city"].apply(is_real)]["_city"].value_counts().head(4)
        sections.append(
            f'<div style="border:1px solid #f1f5f9;border-radius:8px;overflow:hidden;margin-bottom:12px">'
            f'<div style="background:{bg};border-left:4px solid {c};padding:14px 20px;display:flex;justify-content:space-between;align-items:center">'
            f'<div><div style="font-size:14px;font-weight:800;color:#1e293b">{BRAND_DISPLAY.get(b,b)}</div>'
            f'<div style="font-size:11px;color:#534AB7;font-style:italic;margin-top:2px">* {one_liner(bm,nm)}</div></div>'
            f'<div style="text-align:right"><div style="font-size:26px;font-weight:900;color:{c}">{fmt(nm)}</div>'
            f'<div style="font-size:10px;color:#94a3b8">{pcts(nm,len(dm))} of MTD</div></div></div>'
            f'<div style="padding:16px 20px">'
            +cell2(
                label("Property Breakdown")+prop_bars+f'<div style="font-size:10px;color:#94a3b8;margin-top:4px">{tier_str}</div>',
                label("Top States")+("".join(f'<div style="font-size:12px;color:#334155;padding:2px 0">{i+1}. {s} <span style="color:#94a3b8">— {fmt(n)}</span></div>' for i,(s,n) in enumerate(top_s.items())))
                +f'<div style="margin-top:8px">'+label("Top Cities")
                +"".join(f'<div style="font-size:12px;color:#334155;padding:2px 0">{c2} <span style="color:#94a3b8">— {fmt(n2)}</span></div>' for c2,n2 in rc.items())+'</div>')
            +'</div></div>')
    return sec_div("Brand Intelligence","MTD performance")+f'<tr><td style="padding-bottom:16px">{"".join(sections)}</td></tr>'

# ── CRM INTELLIGENCE ──────────────────────────────────────────────────────────
def build_crm(crm, crm_m, crm_p):
    if crm.empty: return ""
    total_m = len(crm_m); total_p = len(crm_p)
    cont_m  = len(crm_m[crm_m["Status"].isin(CONT_S)])
    cont_p  = len(crm_p[crm_p["Status"].isin(CONT_S)])
    disc_m  = len(crm_m[crm_m["Status"]=="Under Discussion"])
    disc_p  = len(crm_p[crm_p["Status"]=="Under Discussion"])
    drop_m  = len(crm_m[crm_m["Status"]=="Lead Dropped"])
    drop_p  = len(crm_p[crm_p["Status"]=="Lead Dropped"])
    new_m   = len(crm_m[crm_m["Status"]=="New Leads"])

    cr_now  = pct(cont_m, total_m); cr_prev = pct(cont_p, total_p)
    dr_now  = pct(drop_m, total_m); dr_prev = pct(drop_p, total_p)
    disc_r  = pct(disc_m, total_m); disc_r_p = pct(disc_p, total_p)

    def pp(now, prev, good_high=True):
        diff = now - prev
        if not prev or diff == 0: return ""
        col = "#16a34a" if (diff > 0) == good_high else "#ef4444"
        return f' <span style="font-size:10px;color:{col}">{"▲" if diff>0 else "▼"}{abs(diff):.1f}pp</span>'

    def rc(r, bench, good_high=True):
        good = r >= bench if good_high else r <= bench
        return "#16a34a" if good else ("#d97706" if abs(r-bench)/max(bench,1)*100<30 else "#ef4444")

    def col_pct(v, bench, good_high=True):
        c = "#16a34a" if (v>=bench if good_high else v<=bench) else "#ef4444"
        return f'<span style="color:{c};font-weight:700">{v:.0f}%</span>'

    cr_col = rc(cr_now, 40); dr_col = rc(dr_now, 15, False); di_col = rc(disc_r, 8)

    # ── 1. PIPELINE SCORECARD (MTD vs last month only) ────────────────────────
    scorecard = (
        f'<div style="font-size:13px;font-weight:700;color:#1a1a1a;margin:0 0 12px;border-bottom:1px solid #f0f0ee;padding-bottom:6px">'
        f'Pipeline Scorecard &mdash; {TODAY.strftime("%B %Y")}</div>'
        f'<table width="100%" cellpadding="0" cellspacing="0"><tr>'
        f'<td style="vertical-align:top;width:33%;padding-right:10px">'
        f'<div style="background:#fafafa;border:1px solid #f0f0ee;border-radius:6px;padding:14px 16px">'
        f'<div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px">Contacted</div>'
        f'<div style="font-size:24px;font-weight:900;color:{cr_col};line-height:1">{fmt(cont_m)}</div>'
        f'</div></td>'
        f'<td style="vertical-align:top;width:33%;padding-right:10px">'
        f'<div style="background:#fafafa;border:1px solid #f0f0ee;border-radius:6px;padding:14px 16px">'
        f'<div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px">Dropped</div>'
        f'<div style="font-size:24px;font-weight:900;color:{dr_col};line-height:1">{fmt(drop_m)}</div>'
        f'</div></td>'
        f'<td style="vertical-align:top;width:33%">'
        f'<div style="background:#fafafa;border:1px solid #f0f0ee;border-radius:6px;padding:14px 16px">'
        f'<div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px">In Discussion</div>'
        f'<div style="font-size:24px;font-weight:900;color:{di_col};line-height:1">{fmt(disc_m)}</div>'
        f'<div style="font-size:10px;color:#94a3b8;margin-top:5px">Unworked: {fmt(new_m)}</div>'
        f'</div></td>'
        f'</tr></table>'
    )

    # ── 2. STATUS FUNNEL ─────────────────────────────────────────────────────
    STATUS_COLORS = {"New Leads":"#94a3b8","Lead Contacted":"#3b82f6",
                     "Under Discussion":"#8b5cf6","Lead Dropped":"#ef4444"}
    funnel_rows = ""
    for s in CRM_STATUSES:
        n = len(crm_m[crm_m["Status"]==s]); np_ = len(crm_p[crm_p["Status"]==s])
        p = pct(n, total_m); w = max(4, p)
        col = STATUS_COLORS.get(s, "#94a3b8")
        funnel_rows += (
            f'<div style="margin-bottom:12px">'
            f'<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px">'
            f'<span style="font-size:12px;font-weight:600;color:#334155">{s}</span>'
            f'<div><span style="font-size:16px;font-weight:800;color:#1a1a1a">{fmt(n)}</span>'
            f'<span style="font-size:11px;color:#94a3b8;margin-left:4px">({p:.1f}%)</span></div></div>'
            f'<div style="background:#f0f0ee;border-radius:3px;height:8px;overflow:hidden">'
            f'<div style="background:{col};width:{w:.1f}%;height:8px;border-radius:3px"></div></div></div>')

    funnel = (
        f'<div style="height:1px;background:#f0f0ee;margin:16px 0"></div>'
        f'<div style="font-size:13px;font-weight:700;color:#1a1a1a;margin-bottom:12px;border-bottom:1px solid #f0f0ee;padding-bottom:6px">Status Funnel — {_P_SHORT}</div>'
        + funnel_rows
    )

    # ── 3. BRAND FUNNEL COMPARISON ────────────────────────────────────────────
    brand_cards = ""
    for b in BRANDS:
        bm = crm_m[crm_m["Brand"]==b]; bn = len(bm)
        if bn == 0: continue
        bc_n = len(bm[bm["Status"].isin(CONT_S)])
        bd_n = len(bm[bm["Status"]=="Under Discussion"])
        bdr_n = len(bm[bm["Status"]=="Lead Dropped"])
        c = BRAND_COLOR.get(b,"#666"); bg = BRAND_LIGHT.get(b,"#f8fafc")
        brand_cards += (
            f'<td style="vertical-align:top;padding-right:8px">'
            f'<div style="background:{bg};border:1px solid #f0f0ee;border-radius:6px;padding:12px 14px;border-top:3px solid {c}">'
            f'<div style="font-size:11px;font-weight:700;color:#1e293b;margin-bottom:10px">{BRAND_DISPLAY.get(b,b)}</div>'
            f'<div style="font-size:11px;color:#475569;margin-bottom:5px">Total: <b style="color:#1e293b">{fmt(bn)}</b></div>'
            f'<div style="font-size:11px;color:#475569;margin-bottom:5px">Contacted: <b style="color:#1e293b">{fmt(bc_n)}</b></div>'
            f'<div style="font-size:11px;color:#475569;margin-bottom:5px">In Discussion: <b style="color:#1e293b">{fmt(bd_n)}</b></div>'
            f'<div style="font-size:11px;color:#475569;margin-bottom:0">Dropped: <b style="color:#ef4444">{fmt(bdr_n)}</b></div>'
            f'</div></td>'
        )

    brand_funnel = (
        f'<div style="height:1px;background:#f0f0ee;margin:16px 0"></div>'
        f'<div style="font-size:13px;font-weight:700;color:#1a1a1a;margin-bottom:12px;border-bottom:1px solid #f0f0ee;padding-bottom:6px">Brand Funnel Comparison</div>'
        f'<table width="100%" cellpadding="0" cellspacing="0"><tr>{brand_cards}</tr></table>'
    ) if brand_cards else ""

    # ── 4. LEAD AGE ANALYSIS ──────────────────────────────────────────────────
    age_buckets = [("Fresh (<7 days)","#22c55e","Ready to work"),
                   ("Active (7-30 days)","#3b82f6","Engage now"),
                   ("Stale (30-90 days)","#f59e0b","At risk of going cold"),
                   ("Dead (90+ days)","#ef4444","Action required")]
    age_data = crm_m[crm_m["Status"]=="New Leads"]["AgeBucket"].value_counts().to_dict() if "AgeBucket" in crm_m.columns else {}
    age_rows = "".join(
        f'<div style="margin-bottom:10px">'
        f'<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:3px">'
        f'<span style="font-size:12px;font-weight:600;color:#334155">{bucket}</span>'
        f'<div><span style="font-size:14px;font-weight:800;color:#1a1a1a">{fmt(n)}</span>'
        f'<span style="font-size:10px;color:#94a3b8;margin-left:4px">({pct(n,new_m):.1f}%)</span></div></div>'
        f'<div style="background:#f0f0ee;border-radius:3px;height:7px;overflow:hidden">'
        f'<div style="background:{color};width:{pct(n,new_m):.1f}%;height:7px;border-radius:3px"></div></div>'
        f'<div style="font-size:10px;color:#94a3b8;margin-top:2px">{note}</div></div>'
        for bucket, color, note in age_buckets
        if (n := age_data.get(bucket, 0)) > 0
    )
    lead_age = (
        f'<div style="height:1px;background:#f0f0ee;margin:16px 0"></div>'
        f'<div style="font-size:13px;font-weight:700;color:#1a1a1a;margin-bottom:4px;border-bottom:1px solid #f0f0ee;padding-bottom:6px">Lead Age Analysis — Unworked New Leads</div>'
        f'<div style="font-size:10px;color:#94a3b8;margin-bottom:10px">{fmt(new_m)} total unworked this month</div>'
        + age_rows
    ) if age_rows else ""

    # ── 5. CITY PERFORMANCE ───────────────────────────────────────────────────
    city_df = crm_m[crm_m["City"].apply(lambda c: is_real(str(c)) if c else False)] if "City" in crm_m.columns else pd.DataFrame()
    city_rows_html = ""
    if not city_df.empty:
        top_cities = city_df["City"].value_counts().head(14)
        for city, n in top_cities.items():
            cd = city_df[city_df["City"]==city]
            cr_n = len(cd[cd["Status"].isin(CONT_S)])
            dr_n = len(cd[cd["Status"]=="Lead Dropped"])
            city_rows_html += (
                f'<tr style="border-bottom:1px solid #f8fafc">'
                f'<td style="font-size:12px;color:#334155;padding:7px 0">{city}</td>'
                f'<td style="font-size:12px;font-weight:600;color:#1e293b;text-align:right;padding:7px 8px">{fmt(n)}</td>'
                f'<td style="font-size:12px;font-weight:700;color:#16a34a;text-align:right;padding:7px 8px">{fmt(cr_n)}</td>'
                f'<td style="font-size:12px;font-weight:700;color:#ef4444;text-align:right;padding:7px 0">{fmt(dr_n)}</td>'
                f'</tr>')

    city_perf = (
        f'<div style="height:1px;background:#f0f0ee;margin:16px 0"></div>'
        f'<div style="font-size:13px;font-weight:700;color:#1a1a1a;margin-bottom:12px;border-bottom:1px solid #f0f0ee;padding-bottom:6px">City Performance</div>'
        f'<table width="100%" cellpadding="0" cellspacing="0">'
        f'<tr>'
        + "".join(f'<th style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;padding:6px {"0" if i in (0,3) else "8px"};font-weight:600;text-align:{"left" if i==0 else "right"};border-bottom:2px solid #f0f0ee">{h}</th>'
                  for i,h in enumerate(["City","Leads","Contacted","Dropped"]))
        + f'</tr>{city_rows_html}</table>'
    ) if city_rows_html else ""

    # ── 6. PROPERTY · LAND PROFILE + DROP REASON ─────────────────────────────
    lp_colors = {"Vacant land":"#f59e0b","Operational":"#22c55e","Under Construction":"#3b82f6","Unknown":"#94a3b8"}
    lp_bars = ""
    if "LandProfile" in crm_m.columns:
        for p_, n_ in crm_m["LandProfile"].value_counts().items():
            lp_bars += svg_hbar_row(p_, n_, total_m, lp_colors.get(p_,"#94a3b8"))

    dr_bars = ""; dr_note = ""
    if "DropReason" in crm_m.columns:
        drop_total = drop_m
        dr_series = crm_m[(crm_m["Status"]=="Lead Dropped") & crm_m["DropReason"].str.strip().str.len().gt(1)]["DropReason"]
        classified = dr_series[~dr_series.str.lower().isin(["others","other","na","n/a",""])].value_counts()
        unclassified_pct = 100 - pct(len(classified), drop_total) if drop_total else 0
        if unclassified_pct > 50:
            dr_note = f'<div style="font-size:11px;background:#fef3c7;border-radius:4px;padding:8px 10px;margin-bottom:10px;color:#92400e">⚠ {100-unclassified_pct:.0f}% of drops have a classified reason. Make drop reason a mandatory CRM field.</div>'
        dr_bars = "".join(svg_hbar_row(r[:35], n_, drop_total, "#ef4444") for r, n_ in classified.head(6).items())
        if not dr_bars:
            dr_bars = '<div style="font-size:11px;color:#94a3b8">No classified reasons this month.</div>'

    prop_profile = (
        f'<div style="height:1px;background:#f0f0ee;margin:16px 0"></div>'
        + cell2(
            f'<div style="font-size:13px;font-weight:700;color:#1a1a1a;margin-bottom:12px;border-bottom:1px solid #f0f0ee;padding-bottom:6px">Property · Land Profile</div>'
            + lp_bars,
            f'<div style="font-size:13px;font-weight:700;color:#1a1a1a;margin-bottom:12px;border-bottom:1px solid #f0f0ee;padding-bottom:6px">Drop Reason Analysis</div>'
            + dr_note + dr_bars
        )
    ) if lp_bars else ""

    # Owner Performance — all owners from full CRM history; MTD counts from crm_m
    _admin_pat = "admin.zoho|super admin"
    all_owners = sorted(crm[~crm["Owner"].str.lower().str.contains(_admin_pat, na=False)]["Owner"].unique())
    _mtd_owners = crm_m[~crm_m["Owner"].str.lower().str.contains(_admin_pat, na=False)]
    owner_stats = []
    for ow in all_owners:
        od = _mtd_owners[_mtd_owners["Owner"] == ow]
        n = len(od)
        contact_n = len(od[od["Status"].isin(CONT_S)]) if n else 0
        drop_n    = len(od[od["Status"] == "Lead Dropped"]) if n else 0
        owner_stats.append((ow, n, contact_n, drop_n))
    # Sort: most leads first, then alphabetically
    owner_stats.sort(key=lambda x: (-x[1], x[0]))

    def _owner_row(lbl, n, contact_n, drop_n):
        dim = "color:#b0b8c4" if n == 0 else "color:#334155"
        td = f'font-size:12px;{dim};padding:8px 10px 8px 0;border-bottom:1px solid #f8fafc;text-align:right'
        return (
            f'<tr>'
            f'<td style="font-size:12px;{dim};padding:8px 10px 8px 0;border-bottom:1px solid #f8fafc;text-align:left">{lbl}</td>'
            f'<td style="{td}">{"—" if n==0 else fmt(n)}</td>'
            f'<td style="{td}">{"—" if n==0 else fmt(contact_n)}</td>'
            f'<td style="{td}">{"—" if n==0 else fmt(drop_n)}</td>'
            f'</tr>'
        )
    owner_rows = "".join(_owner_row(lbl,n,c,d) for lbl,n,c,d in owner_stats)

    owner_tbl = (
        f'<div style="height:1px;background:#f0f0ee;margin:16px 0"></div>'
        f'<div style="font-size:13px;font-weight:700;color:#1a1a1a;margin-bottom:10px;border-bottom:1px solid #f0f0ee;padding-bottom:6px">Owner Performance</div>'
        f'<table width="100%" cellpadding="0" cellspacing="0"><tr>'
        + "".join(f'<th style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;padding:7px 10px 7px 0;font-weight:600;text-align:{"left" if i==0 else "right"};border-bottom:2px solid #f0f0ee">{h}</th>'
                  for i,h in enumerate(["Owner","Leads","Contacted","Dropped"]))
        + f'</tr>{owner_rows}</table>'
        f'<div style="font-size:10px;color:#94a3b8;margin-top:6px">Contacted = Lead Contacted + Under Discussion. All figures are MTD.</div>'
    ) if owner_rows else ""

    inner = (f'<div style="background:#fff;border:1px solid #e8e8e6;border-radius:8px;padding:20px 24px">'
             + scorecard + funnel + brand_funnel + lead_age + city_perf + prop_profile + owner_tbl
             + f'</div>')
    return (sec_div("CRM Intelligence",f"{_P_SHORT} vs {_P_PREV} · Zoho CRM","#534AB7")
            + f'<tr><td style="padding-bottom:16px">{inner}</td></tr>')


# ── ZOOM CALL INTELLIGENCE SECTION ────────────────────────────────────────────
def build_zoom(zoom):
    if not zoom or not zoom.get("perf"):
        return ""
    perf       = zoom["perf"]
    rec        = zoom.get("rec", {})
    perf_from  = zoom.get("perf_from", CUR_START)

    # Team totals
    total_out  = sum(u.get("outbound_calls", 0) for u in perf)
    total_conn = sum(u.get("connected_outbound_calls", 0) for u in perf)
    conn_pct_v = pct(total_conn, total_out)

    # Recording metrics (derived from call logs — MTD same window as perf)
    rec_connected = rec.get("total_connected_calls", 0)
    rec_recorded  = rec.get("recorded_calls", 0)
    rec_rate_v    = pct(rec_recorded, rec_connected)
    rec_cfg       = rec.get("users_configured_auto_recording")  # None = unknown
    rec_total_u   = rec.get("total_users", 0)

    active_users   = sorted([u for u in perf if u.get("outbound_calls", 0) > 0],
                            key=lambda u: -u.get("outbound_calls", 0))
    inactive_users = [u for u in perf if u.get("outbound_calls", 0) == 0]

    # Colour helpers (email-safe hex only)
    def ct_colors(s):          # avg call time in seconds
        if s < 120: return "#ef4444", "#fef2f2"
        if s < 180: return "#d97706", "#fffbeb"
        return "#16a34a", "#f0fdf4"
    def cc_color(p):           # connection %
        return "#16a34a" if p >= 50 else ("#d97706" if p >= 40 else "#ef4444")
    def secs_fmt(s):
        s = int(s or 0)
        return f"{s//60}:{s%60:02d}"

    # KPI cards
    rec_col  = "#16a34a" if rec_rate_v >= 85 else ("#d97706" if rec_rate_v >= 70 else "#ef4444")
    inact_col= "#ef4444" if len(inactive_users) > 5 else ("#d97706" if len(inactive_users) > 2 else "#16a34a")
    def kz(val, title, sub, color):
        return (f'<td style="vertical-align:top;padding-right:8px">'
                f'<div style="background:#fafafa;border:1px solid #f0f0ee;border-radius:6px;padding:14px;border-top:3px solid {color}">'
                f'<div style="font-size:22px;font-weight:900;color:{color};line-height:1">{val}</div>'
                f'<div style="font-size:11px;font-weight:600;color:#475569;margin-top:5px">{title}</div>'
                f'<div style="font-size:10px;color:#94a3b8;margin-top:2px">{sub}</div>'
                f'</div></td>')
    kpis = (f'<table width="100%" cellpadding="0" cellspacing="0"><tr>'
            + kz(f"{total_out:,}", "Outbound calls",
                 f"MTD · {perf_from.strftime('%b %d')}–{TODAY.strftime('%b %d')}", "#334155")
            + kz(f"{conn_pct_v:.1f}%", "Connection rate",
                 f"{total_conn:,} of {total_out:,} connected", cc_color(conn_pct_v))
            + kz(f"{rec_rate_v:.0f}%", "Calls recorded",
                 f"{rec_recorded} of {rec_connected} connected · MTD", rec_col)
            + kz(str(len(inactive_users)), "Zero outbound",
                 "BDs with no calls this period", inact_col)
            + f'</tr></table>')

    # Leaderboard table
    ths = "font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;padding:7px 8px;font-weight:600;border-bottom:2px solid #f0f0ee"
    def bd_row(u):
        name = u.get("name", "—"); ext  = u.get("extension_number", "")
        out  = u.get("outbound_calls", 0)
        conn = u.get("connected_outbound_calls", 0)
        cp   = pct(conn, out)
        avg_s= int(u.get("avg_call_time", 0))
        tc, tb = ct_colors(avg_s)
        avg_f = secs_fmt(avg_s) if avg_s else "—"
        sig = ""
        if 0 < avg_s < 90:
            sig = '<span style="font-size:10px;background:#fef2f2;color:#ef4444;padding:2px 6px;border-radius:3px;font-weight:600">Very short</span>'
        elif 0 < avg_s < 120:
            sig = '<span style="font-size:10px;background:#fffbeb;color:#d97706;padding:2px 6px;border-radius:3px;font-weight:600">Short calls</span>'
        td = "border-bottom:1px solid #f8fafc"
        return (f'<tr>'
                f'<td style="font-size:12px;color:#1e293b;padding:8px 8px 8px 0;{td};font-weight:600">'
                f'{name}<span style="font-size:10px;color:#94a3b8;font-weight:400;margin-left:4px">Ext.{ext}</span></td>'
                f'<td style="font-size:12px;font-weight:700;color:#334155;text-align:right;padding:8px;{td}">{out:,}</td>'
                f'<td style="font-size:12px;font-weight:700;color:#334155;text-align:right;padding:8px;{td}">{conn:,}</td>'
                f'<td style="text-align:right;padding:8px;{td}"><span style="font-size:12px;font-weight:700;color:{cc_color(cp)}">{cp:.1f}%</span></td>'
                f'<td style="text-align:right;padding:8px;{td}"><span style="font-size:12px;font-weight:700;color:{tc};background:{tb};padding:2px 6px;border-radius:3px">{avg_f}</span></td>'
                f'<td style="text-align:right;padding:8px 0 8px 8px;{td}">{sig}</td>'
                f'</tr>')
    leaderboard = (
        f'<div style="height:1px;background:#f0f0ee;margin:16px 0"></div>'
        f'<div style="font-size:13px;font-weight:700;color:#1a1a1a;margin-bottom:10px;border-bottom:1px solid #f0f0ee;padding-bottom:6px">'
        f'BD Leaderboard — {perf_from.strftime("%b %d")} to {TODAY.strftime("%b %d, %Y")}</div>'
        f'<table width="100%" cellpadding="0" cellspacing="0">'
        f'<tr><th style="{ths};text-align:left">Name</th>'
        f'<th style="{ths};text-align:right">Outbound</th>'
        f'<th style="{ths};text-align:right">Connected</th>'
        f'<th style="{ths};text-align:right">Conn %</th>'
        f'<th style="{ths};text-align:right">Avg time</th>'
        f'<th style="{ths};text-align:right">Signal</th></tr>'
        + "".join(bd_row(u) for u in active_users[:12])
        + f'</table>'
        f'<div style="font-size:10px;color:#94a3b8;margin-top:6px">'
        f'Avg time = avg connected call duration &nbsp;·&nbsp; '
        f'<span style="color:#16a34a">Green</span> ≥3 min &nbsp;·&nbsp; '
        f'<span style="color:#d97706">Amber</span> 2–3 min &nbsp;·&nbsp; '
        f'<span style="color:#ef4444">Red</span> &lt;2 min</div>'
    )

    # Zero-outbound list
    inactive_html = ""
    if inactive_users:
        tags = "".join(
            f'<span style="display:inline-block;font-size:11px;background:#f1f5f9;color:#64748b;'
            f'padding:3px 8px;border-radius:4px;margin:2px 3px 2px 0">'
            f'{u["name"]} (Ext.{u.get("extension_number","")})</span>'
            for u in inactive_users)
        inactive_html = (
            f'<div style="height:1px;background:#f0f0ee;margin:16px 0"></div>'
            f'<div style="font-size:13px;font-weight:700;color:#1a1a1a;margin-bottom:8px;'
            f'border-bottom:1px solid #f0f0ee;padding-bottom:6px">Zero outbound this period</div>'
            f'<div>{tags}</div>')

    # Recording gap alert
    rec_alert = ""
    unrecorded = (rec_connected - rec_recorded) if rec_connected else 0
    if unrecorded > 0 and rec_rate_v < 85:
        msgs = [f"{unrecorded} connected calls were not recorded (MTD)"]
        rec_alert = (
            f'<div style="margin-top:12px;background:#fef3c7;border-left:3px solid #d97706;'
            f'border-radius:0 4px 4px 0;padding:10px 14px">'
            f'<div style="font-size:11px;font-weight:700;color:#92400e;margin-bottom:3px">⚠ Recording gaps</div>'
            + "".join(f'<div style="font-size:11px;color:#92400e">• {m}</div>' for m in msgs)
            + f'</div>')

    inner = (f'<div style="background:#fff;border:1px solid #e8e8e6;border-radius:8px;padding:20px 24px">'
             + kpis + leaderboard + inactive_html + rec_alert + f'</div>')
    return (sec_div("Zoom Call Intelligence",
                    f"MTD performance · recording compliance · BD activity", "#0057A8")
            + f'<tr><td style="padding-bottom:16px">{inner}</td></tr>')


def build_zoom_quality(zoom):
    """Redesigned BD Call Intelligence: real metrics + AI coaching per BD."""
    if not zoom or not zoom.get("perf"):
        return ""

    perf      = zoom["perf"]
    rec       = zoom.get("rec", {})
    perf_from = zoom.get("perf_from", CUR_START)
    lead_cov  = zoom.get("lead_coverage", {})
    quality   = zoom.get("quality", {})

    total_out  = sum(u.get("outbound_calls", 0)           for u in perf)
    total_conn = sum(u.get("connected_outbound_calls", 0) for u in perf)
    conn_pct_v = pct(total_conn, total_out)
    total_leads_cov = lead_cov.get("total_leads_in_sheet", 0)
    leads_called    = lead_cov.get("leads_called", 0)
    cov_pct_v = pct(leads_called, total_leads_cov)

    # Global avg call duration (connected calls only)
    all_durs   = [u.get("avg_call_time", 0) for u in perf if u.get("avg_call_time", 0) > 0]
    global_avg = int(sum(all_durs) / len(all_durs)) if all_durs else 0

    active_users   = sorted([u for u in perf if u.get("outbound_calls", 0) > 0],
                            key=lambda u: -u.get("outbound_calls", 0))
    inactive_users = [u for u in perf if u.get("outbound_calls", 0) == 0]

    def cc_color(p):
        return "#16a34a" if p >= 50 else ("#d97706" if p >= 40 else "#ef4444")
    def dur_color(s):
        if s <= 0:   return "#94a3b8"
        if s < 120:  return "#ef4444"
        if s < 180:  return "#d97706"
        return "#16a34a"
    def secs_fmt(s):
        s = int(s or 0)
        return f"{s//60}m {s%60:02d}s" if s >= 60 else f"{s}s"
    def tat_fmt(h):
        if h is None: return "—"
        if h < 1:     return f"{int(h*60)}m"
        if h < 24:    return f"{h:.1f}h"
        return f"{h/24:.1f}d"
    def tat_color(h):
        if h is None: return "#94a3b8"
        if h <= 2:    return "#16a34a"
        if h <= 24:   return "#d97706"
        return "#ef4444"

    # ── Summary KPI strip ────────────────────────────────────────────────────
    def kpill(val, label, color="#334155"):
        return (f'<td style="padding-right:20px;vertical-align:top">'
                f'<div style="font-size:20px;font-weight:900;color:{color};line-height:1.1">{val}</div>'
                f'<div style="font-size:10px;color:#94a3b8;text-transform:uppercase;'
                f'letter-spacing:0.06em;margin-top:2px;font-weight:600">{label}</div>'
                f'</td>')
    kpi_strip = (
        f'<div style="background:#f8fafc;border-radius:6px;padding:14px 16px;margin-bottom:16px">'
        f'<table cellpadding="0" cellspacing="0"><tr>'
        + kpill(f"{total_out:,}", f"outbound MTD · {perf_from.strftime('%b %d')}–{TODAY.strftime('%b %d')}")
        + kpill(f"{conn_pct_v:.0f}%", "connection rate", cc_color(conn_pct_v))
        + kpill(secs_fmt(global_avg), "avg call duration", dur_color(global_avg))
        + kpill(f"{leads_called}/{total_leads_cov}", f"leads covered ({cov_pct_v:.0f}%)",
                "#16a34a" if cov_pct_v >= 20 else ("#d97706" if cov_pct_v >= 10 else "#ef4444"))
        + f'</tr></table></div>')

    # ── Per-BD cards ─────────────────────────────────────────────────────────
    def metric_pill(val, label, color="#475569", bg="#f1f5f9"):
        return (f'<span style="display:inline-block;background:{bg};border-radius:4px;'
                f'padding:4px 10px;margin:0 6px 5px 0;font-size:11px">'
                f'<span style="font-weight:700;color:{color}">{val}</span>'
                f'<span style="color:#94a3b8;margin-left:4px">{label}</span></span>')

    def skill_bar(label, score):
        """Mini horizontal bar for a skill score 0-10."""
        sc  = max(0.0, min(10.0, float(score or 0)))
        pct_w = f"{sc * 10:.0f}%"
        if sc >= 7.5:   col = "#16a34a"
        elif sc >= 5.5: col = "#d97706"
        else:           col = "#ef4444"
        return (
            f'<tr>'
            f'<td style="font-size:10px;color:#64748b;padding:2px 8px 2px 0;white-space:nowrap;'
            f'vertical-align:middle;width:90px">{label}</td>'
            f'<td style="vertical-align:middle;padding:2px 8px 2px 0">'
            f'<div style="background:#f1f5f9;border-radius:3px;height:6px">'
            f'<div style="background:{col};width:{pct_w};height:6px;border-radius:3px"></div>'
            f'</div></td>'
            f'<td style="font-size:10px;font-weight:700;color:{col};width:24px;'
            f'text-align:right;vertical-align:middle">{sc:.1f}</td>'
            f'</tr>')

    def signal_tags(signals, color, bg):
        if not signals: return ""
        tags = "".join(
            f'<span style="display:inline-block;font-size:10px;background:{bg};color:{color};'
            f'padding:2px 7px;border-radius:3px;margin:2px 3px 2px 0;font-style:italic">'
            f'"{s}"</span>'
            for s in signals[:3])
        return tags

    def bd_card(u):
        name  = u.get("name", "—")
        out   = u.get("outbound_calls", 0)
        conn  = u.get("connected_outbound_calls", 0)
        cp    = pct(conn, out)
        avg_s = int(u.get("avg_call_time", 0) or 0)
        long_c    = u.get("long_calls", 0)
        long_pct  = u.get("long_call_pct", 0.0)
        ul   = u.get("unique_leads_called", 0)
        lc   = u.get("lead_calls", 0)
        tat  = u.get("avg_tat_hours")

        # Fuzzy quality lookup: try exact, then case-insensitive
        qd = quality.get(name) or quality.get(name.strip())
        if not qd:
            nl = name.strip().lower()
            for k, v in quality.items():
                if k.strip().lower() == nl:
                    qd = v; break
        qd = qd or {}

        insight      = qd.get("insight", "")
        strength     = qd.get("strength", "")
        improve      = qd.get("improve", "")
        n_recs       = qd.get("transcripts_analyzed", 0)
        ai_pow       = qd.get("ai_powered", False)
        conv_sigs    = qd.get("conversion_signals", [])
        drop_sigs    = qd.get("dropoff_signals", [])
        has_scores   = any(k in qd for k in ("soft_skills","brand_alignment","pitch_skills",
                                              "sales_skills","conversion_skills"))

        border_col = cc_color(cp) if out > 0 else "#e2e8f0"

        ai_badge = (
            '<span style="font-size:9px;background:#ede9fe;color:#7c3aed;padding:1px 5px;'
            'border-radius:3px;font-weight:600;margin-left:5px">AI</span>'
            if ai_pow else
            '<span style="font-size:9px;background:#f1f5f9;color:#94a3b8;padding:1px 5px;'
            'border-radius:3px;font-weight:600;margin-left:5px">~</span>'
            if n_recs else "")

        # ── Metric pills row ──────────────────────────────────────────────────
        pills = ""
        if out > 0:
            pills += metric_pill(secs_fmt(avg_s) if avg_s else "—", "avg duration",
                                 dur_color(avg_s),
                                 "#f0fdf4" if avg_s >= 180 else ("#fffbeb" if avg_s >= 120 else "#fef2f2"))
            pills += metric_pill(f"{long_c} ({long_pct:.0f}%)", "calls ≥3m",
                                 "#16a34a" if long_pct >= 40 else ("#d97706" if long_pct >= 20 else "#94a3b8"))
            if ul > 0:
                pills += metric_pill(f"{lc} calls · {ul} unique", "lead coverage")
            if tat is not None:
                pills += metric_pill(tat_fmt(tat), "avg TAT",
                                     tat_color(tat),
                                     "#f0fdf4" if tat <= 2 else ("#fffbeb" if tat <= 24 else "#fef2f2"))

        pills_html = f'<div style="margin:7px 0">{pills}</div>' if pills else ""

        # ── 5-skill score bars (two-column layout) ────────────────────────────
        skill_html = ""
        if has_scores:
            left_bars  = (skill_bar("Soft skills",    qd.get("soft_skills", 0))
                        + skill_bar("Brand alignment", qd.get("brand_alignment", 0))
                        + skill_bar("Pitch skills",    qd.get("pitch_skills", 0)))
            right_bars = (skill_bar("Sales skills",   qd.get("sales_skills", 0))
                        + skill_bar("Conversion",      qd.get("conversion_skills", 0)))
            skill_html = (
                f'<div style="margin-top:9px;padding-top:9px;border-top:1px solid #f0f0ee">'
                f'<table width="100%" cellpadding="0" cellspacing="0"><tr>'
                f'<td style="width:50%;vertical-align:top;padding-right:12px">'
                f'<table cellpadding="0" cellspacing="0" width="100%">{left_bars}</table></td>'
                f'<td style="width:50%;vertical-align:top">'
                f'<table cellpadding="0" cellspacing="0" width="100%">{right_bars}</table></td>'
                f'</tr></table></div>')

        # ── Coaching narrative ────────────────────────────────────────────────
        coaching_html = ""
        if insight or conv_sigs or drop_sigs:
            n_str = (f'<span style="font-size:9px;color:#94a3b8;margin-left:6px">'
                     f'{n_recs} recording{"s" if n_recs!=1 else ""} analysed</span>'
                     if n_recs else "")
            st_tag = (f'<span style="display:inline-block;font-size:10px;background:#f0fdf4;'
                      f'color:#15803d;padding:2px 7px;border-radius:3px;margin:0 5px 4px 0;'
                      f'font-weight:600">✓ {strength}</span>' if strength else "")
            im_tag = (f'<span style="display:inline-block;font-size:10px;background:#fef3c7;'
                      f'color:#92400e;padding:2px 7px;border-radius:3px;margin:0 0 4px 0;'
                      f'font-weight:600">⚑ {improve}</span>' if improve else "")

            conv_row = ""
            if conv_sigs:
                conv_row = (f'<div style="margin-top:6px">'
                            f'<span style="font-size:10px;font-weight:600;color:#15803d">↑ Conversion signals: </span>'
                            + signal_tags(conv_sigs, "#15803d", "#f0fdf4")
                            + f'</div>')
            drop_row = ""
            if drop_sigs:
                drop_row = (f'<div style="margin-top:4px">'
                            f'<span style="font-size:10px;font-weight:600;color:#b91c1c">↓ Drop-off signals: </span>'
                            + signal_tags(drop_sigs, "#b91c1c", "#fef2f2")
                            + f'</div>')

            coaching_html = (
                f'<div style="margin-top:9px;padding:10px 12px;background:#f8fafc;border-radius:5px;'
                f'border-left:3px solid #a5b4fc">'
                f'<div style="font-size:10px;font-weight:700;color:#6366f1;margin-bottom:5px">'
                f'Call Intelligence{ai_badge}{n_str}</div>'
                + (f'<div style="font-size:11px;color:#334155;line-height:1.55;margin-bottom:6px">'
                   f'{insight}</div>' if insight else "")
                + (f'<div style="margin-bottom:5px">{st_tag}{im_tag}</div>' if st_tag or im_tag else "")
                + conv_row + drop_row
                + f'</div>')

        # ── Zero-outbound flag ────────────────────────────────────────────────
        zero_flag = ""
        if out == 0:
            zero_flag = (f'<div style="font-size:10px;color:#ef4444;margin-top:4px">'
                         f'No outbound calls this period</div>')

        return (
            f'<div style="border:1px solid #e2e8f0;border-radius:7px;padding:12px 14px;'
            f'margin-bottom:10px;border-left:4px solid {border_col}">'
            f'<table width="100%" cellpadding="0" cellspacing="0"><tr>'
            f'<td><span style="font-size:13px;font-weight:700;color:#1e293b">{name}</span></td>'
            f'<td style="text-align:right">'
            + (f'<span style="font-size:11px;font-weight:700;color:#334155">{out:,} calls</span>'
               f'<span style="font-size:11px;color:#94a3b8;margin:0 5px">·</span>'
               f'<span style="font-size:11px;font-weight:700;color:{cc_color(cp)}">{cp:.0f}% conn</span>'
               if out > 0 else
               f'<span style="font-size:11px;color:#ef4444;font-weight:600">No activity</span>')
            + f'</td></tr></table>'
            + pills_html + skill_html + coaching_html + zero_flag
            + f'</div>')

    # All BD users: active first (sorted by outbound desc), then inactive
    all_bd_users = active_users + inactive_users
    bd_cards_html = "".join(bd_card(u) for u in all_bd_users)

    inactive_html = ""   # zero-outbound BDs now shown as individual cards above

    # ── Recording compliance note ────────────────────────────────────────────
    rec_connected = rec.get("total_connected_calls", 0)
    rec_recorded  = rec.get("recorded_calls", 0)
    unrecorded    = rec_connected - rec_recorded if rec_connected else 0
    rec_alert     = ""
    if unrecorded > 10:
        rec_alert = (
            f'<div style="margin-top:10px;background:#fef3c7;border-left:3px solid #d97706;'
            f'border-radius:0 4px 4px 0;padding:8px 12px">'
            f'<div style="font-size:11px;color:#92400e">'
            f'⚠ {unrecorded} connected calls not recorded this month — enable auto-recording for full coverage</div></div>')

    inner = (f'<div style="background:#fff;border:1px solid #e8e8e6;border-radius:8px;padding:20px 24px">'
             + kpi_strip + bd_cards_html + inactive_html + rec_alert + f'</div>')
    return (sec_div("BD Call Intelligence",
                    f"MTD · call quality · TAT · AI coaching · {TODAY.strftime('%b %Y')}",
                    "#0057A8")
            + f'<tr><td style="padding-bottom:16px">{inner}</td></tr>')


# ── HTML ASSEMBLY ──────────────────────────────────────────────────────────

def _build_training_flags_section():
    """BD Training Flags — compact digest block.
    Reads bd_remediation_latest.json (generated by bd_training_remediation.py).
    Re-runs the engine live so the digest always reflects the latest scores.
    Disable with DIGEST_INCLUDE_TRAINING=false. Never breaks the digest."""
    if os.getenv("DIGEST_INCLUDE_TRAINING", "true").lower() != "true":
        return ""
    try:
        import sys, importlib
        _base = os.path.dirname(os.path.abspath(__file__))
        if _base not in sys.path:
            sys.path.insert(0, _base)
        import bd_trigger_engine as _te
        importlib.reload(_te)
        # Pass live Zoom activity data if it was fetched this run
        _zoom_ctx = getattr(_build_training_flags_section, "_zoom_ctx", None)
        _act_data = None
        if _zoom_ctx:
            try:
                _act_data = _te.extract_activity_data_from_zoom(_zoom_ctx)
            except Exception as _ae:
                print(f"  [WARN] Activity extraction: {_ae}")
        data   = _te.run_all(activity_data=_act_data)
        summ   = data["summary"]
        reps   = data["reps"]

        # Only surface reps that need action (Warning and above)
        sort_order = {"Critical":0,"Action Required":1,"Warning":2}
        flagged = [(rep, r) for rep, r in reps.items() if r["status"] in sort_order]
        flagged.sort(key=lambda x: (sort_order.get(x[1]["status"],9), -(x[1]["overall"] or 0)))

        if not flagged:
            return ""   # nothing to show — everyone is green

        # ── Header ───────────────────────────────────────────────────────────
        S_COL = {"Critical":"#991B1B","Action Required":"#92400E","Warning":"#1E3A8A"}
        S_BG  = {"Critical":"#FEE2E2","Action Required":"#FEF3C7","Warning":"#DBEAFE"}
        S_LBL = {"Critical":"🚨 Critical","Action Required":"⚠️ Action Req","Warning":"🔵 Warning"}
        MOD_COL = {
            "M1":"#5B21B6","M2":"#166534","M3":"#1D4ED8","M4":"#92400E",
            "M5":"#0E7490","M6":"#0F766E","M7":"#5B21B6","M8":"#991B1B",
        }

        def _pill(code):
            c = MOD_COL.get(code, "#374151")
            return (f'<span style="display:inline-block;background:{c};color:#fff;'
                    f'font-size:10px;font-weight:700;padding:1px 6px;border-radius:3px;'
                    f'margin:1px">{code}</span>')

        rows_html = ""
        for rep, r in flagged:
            sc   = r["status"]
            mods = " ".join(_pill(m) for m in r.get("top_modules", [])[:4]) or "—"
            # Pull top compliance flag description
            comp_triggers = [t for t in r.get("triggers",[]) if t["family"]=="compliance"
                             and t["severity"] not in ("Info","Gold")]
            flags_txt = ""
            if comp_triggers:
                flags_txt = (
                    '<span style="color:#DC2626;font-size:11px">'
                    + " · ".join(t["description"] for t in comp_triggers[:2])
                    + ("…" if len(comp_triggers) > 2 else "")
                    + "</span>"
                )
            rows_html += f"""
            <tr>
              <td style="padding:8px 12px;border-bottom:1px solid #F1F5F9;font-size:13px;
                         font-weight:600;white-space:nowrap">{rep}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #F1F5F9;text-align:center">
                <span style="background:{S_BG.get(sc,'#F3F4F6')};color:{S_COL.get(sc,'#374151')};
                             font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px">
                  {S_LBL.get(sc,sc)}</span>
              </td>
              <td style="padding:8px 12px;border-bottom:1px solid #F1F5F9">{mods}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #F1F5F9;font-size:12px;
                         color:#64748B">{flags_txt or "—"}</td>
            </tr>"""

        n_crit  = summ.get("Critical", 0)
        n_actreq= summ.get("Action Required", 0)
        n_comp  = summ.get("compliance_flags", 0)
        n_ok    = summ.get("OK", 0)
        n_total = data["_meta"]["total_reps_scored"]
        summary_line = (
            f'<strong>{n_crit} critical</strong> · '
            f'<strong>{n_actreq} action required</strong> · '
            f'{n_comp} compliance flag{"s" if n_comp!=1 else ""} · '
            f'{n_ok}/{n_total} reps fully ready'
        )

        return f"""
        <tr><td style="padding:0 32px 24px">
          <div style="font-size:13px;font-weight:800;color:#0F172A;text-transform:uppercase;
                      letter-spacing:.06em;margin-bottom:4px">BD Training Flags</div>
          <div style="font-size:12px;color:#64748B;margin-bottom:12px">{summary_line}</div>
          <table width="100%" cellpadding="0" cellspacing="0"
                 style="border:1px solid #E2E8F0;border-radius:8px;overflow:hidden;
                        border-collapse:collapse">
            <thead>
              <tr style="background:#F8FAFC">
                <th style="padding:7px 12px;text-align:left;font-size:11px;color:#94A3B8;
                           font-weight:600;text-transform:uppercase;letter-spacing:.05em;
                           border-bottom:1px solid #E2E8F0">Rep</th>
                <th style="padding:7px 12px;text-align:center;font-size:11px;color:#94A3B8;
                           font-weight:600;text-transform:uppercase;letter-spacing:.05em;
                           border-bottom:1px solid #E2E8F0">Status</th>
                <th style="padding:7px 12px;text-align:left;font-size:11px;color:#94A3B8;
                           font-weight:600;text-transform:uppercase;letter-spacing:.05em;
                           border-bottom:1px solid #E2E8F0">Revisit</th>
                <th style="padding:7px 12px;text-align:left;font-size:11px;color:#94A3B8;
                           font-weight:600;text-transform:uppercase;letter-spacing:.05em;
                           border-bottom:1px solid #E2E8F0">Compliance Flags</th>
              </tr>
            </thead>
            <tbody>{rows_html}</tbody>
          </table>
        </td></tr>"""

    except Exception as e:
        print(f"  [WARN] BD training flags section skipped: {e}")
        return ""


def _bd_performance_bundle(df, crm):
    """BD Performance bundle: {"insights": cards for Key Insights, "rows": section rows}.
    Sourced from bd_performance_review.py; disable with DIGEST_INCLUDE_BD=false.
    Never breaks the digest — any failure just skips the section."""
    if os.getenv("DIGEST_INCLUDE_BD", "true").lower() != "true":
        return None
    try:
        import bd_performance_review as _bdr
        return _bdr.build_digest_bundle(df, crm)
    except Exception as e:
        print(f"  [WARN] BD performance section skipped: {e}")
        return None

def build_html(df, crm, zoom=None):
    dm = gmtd(df); dp = gprev(df)
    if not crm.empty and "_phone" in crm.columns:
        # Match CRM records to sheet leads by phone — ensures CRM MTD count
        # references the same real-world leads as the sheet MTD count.
        phones_m = set(dm["_phone"].dropna()) - {""}
        phones_p = set(dp["_phone"].dropna()) - {""}
        # Phone match + created in period → avoids counting repeat submitters from prior months
        crm_m = crm[crm["_phone"].isin(phones_m) & crm["_mtd"]] if phones_m else crm[crm["_mtd"]]
        crm_p = crm[crm["_phone"].isin(phones_p) & crm["_prev"]] if phones_p else crm[crm["_prev"]]
    else:
        crm_m = crm[crm["_mtd"]] if not crm.empty else pd.DataFrame()
        crm_p = crm[crm["_prev"]] if not crm.empty else pd.DataFrame()
    tm = len(dm); tc = len(crm_m)
    footer_txt = f'{fmt(tm)} MTD leads · {fmt(tc)} in CRM this month · {datetime.now().strftime("%d %b %Y %I:%M %p")} IST'
    bd_bundle = _bd_performance_bundle(df, crm)
    body_rows = (
        build_briefing(dm, dp, crm_m, crm_p)
        + rule()
        + build_insights(dm, dp, crm_m, crm_p, bd_bundle["insights"] if bd_bundle else "")
        + rule()
        + build_mtd(dm, dp)
        + rule()
        + build_deep(dm, dp)
        + rule()
        + build_brands(dm, dp)
        + (rule() + build_crm(crm, crm_m, crm_p) if not crm.empty else "")
        + (rule() + "".join(r for r in [bd_bundle.get("rows","") if bd_bundle else ""] if r) if bd_bundle else "")
    )
    subject = f"Partner Leads Digest - {TODAY.strftime('%d %b %Y')}"
    html = (
        '<!DOCTYPE html><html><head>'
        '<meta http-equiv="Content-Type" content="text/html; charset=utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        f'<title>Partner With Us &middot; Lead Digest &middot; {TODAY.strftime("%d %b %Y")}</title></head>'
        '<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif">'
        '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px 0">'
        '<tr><td align="center">'
        '<table width="640" cellpadding="0" cellspacing="0" style="background:#fff;'
        'border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06)">'
        '<tr><td style="background:#0f172a;padding:20px 32px">'
        '<div style="font-size:18px;font-weight:900;color:#fff;letter-spacing:-0.5px">Partner With Us</div>'
        f'<div style="font-size:11px;color:#475569;margin-top:2px">Lead Intelligence Digest &middot; {TODAY.strftime("%A, %d %B %Y")}</div>'
        '</td></tr>'
        '<tr><td style="padding:0 32px">'
        '<table width="100%" cellpadding="0" cellspacing="0">'
        + body_rows +
        '</table></td></tr>'
        '<tr><td style="background:#1a1a1a;border-radius:0 0 10px 10px;padding:18px 32px">'
        f'<div style="font-size:11px;color:#555;text-align:center">{footer_txt}</div>'
        '</td></tr>'
        '</table></td></tr></table>'
        '</body></html>'
    )
    return html, subject


def send_email(html: str, subject: str, recipients: list):
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = SMTP_USER
    msg["To"]      = ", ".join(recipients)
    msg.attach(MIMEText(html, "html"))
    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as s:
        s.login(SMTP_USER, SMTP_PASS)
        s.sendmail(SMTP_USER, recipients, msg.as_string())
    print(f"  Digest sent to {len(recipients)} recipients")


def main():
    ap = argparse.ArgumentParser(description="Partner Leads Digest")
    ap.add_argument("--send",     action="store_true", help="Send email to TO_EMAILS list")
    ap.add_argument("--no-zoom",  action="store_true", help="Skip Zoom fetch")
    ap.add_argument("--no-crm",   action="store_true", help="Skip Zoho CRM fetch")
    ap.add_argument("--preview",  action="store_true", help="Save HTML to digest_preview.html")
    ap.add_argument("--to",       nargs="*",           help="Override recipients")
    args = ap.parse_args()

    df  = fetch_sheet()
    crm = fetch_crm() if not args.no_crm else pd.DataFrame()
    zoom = None
    if not args.no_zoom:
        try:
            if ZOOM_QUALITY_MODE:
                zoom = fetch_zoom_quality(df)
            else:
                zoom = fetch_zoom()
        except Exception as ze:
            print(f"  [WARN] Zoom fetch failed: {ze}")

    html, subject = build_html(df, crm, zoom)

    if args.preview:
        out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "digest_preview.html")
        open(out, "w", encoding="utf-8").write(html)
        print(f"  Preview saved → {out}")

    if args.send:
        recipients = args.to or TO_EMAILS
        try:
            send_email(html, subject, recipients)
            print(f"  ✓ Digest sent to {len(recipients)} recipients")
        except Exception as e:
            print(f"  [ERROR] Digest email failed: {e}")

    else:
        print(f"  Subject: {subject}")
  
if __name__ == "__main__":
    main()
