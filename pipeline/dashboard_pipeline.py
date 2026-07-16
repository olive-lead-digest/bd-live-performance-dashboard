"""Shared dashboard data pipeline. Lead UNIVERSE = Zoho CRM Leads module (ALL sources),
NO phone dedup — every Zoho Lead is a lead (analyst L1); BD (Owner)/status/source come
straight off each Leads record; call activity from Zoom (90d); quality from
bd_quality_scores.json. The Partner-With-Us Google Sheet is no longer the lead universe
(it was Meta-only). Regions use the org taxonomy (North / South 1 (KA) / South 2 (AP & TG)
/ South 3 (TN & KL) / East / West), mapped BD-owner -> bd_org.json region first, State
fallback (analyst R1). Tier removed entirely (analyst L2 — no Tier exists in Zoho)."""
import os, json, re, pandas as pd
REGION={
 'Delhi':'North','Haryana':'North','Punjab':'North','Uttar Pradesh':'North','Uttarakhand':'North',
 'Himachal Pradesh':'North','Rajasthan':'North','Jammu And Kashmir':'North','Jammu and Kashmir':'North','Chandigarh':'North',
 'Karnataka':'South','Tamil Nadu':'South','Kerala':'South','Andhra Pradesh':'South','Telangana':'South','Puducherry':'South',
 'Maharashtra':'West','Gujarat':'West','Goa':'West',
 'Madhya Pradesh':'Central','Chhattisgarh':'Central',
 'West Bengal':'East','Bihar':'East','Jharkhand':'East','Odisha':'East',
 'Assam':'Northeast','Arunachal Pradesh':'Northeast','Manipur':'Northeast','Meghalaya':'Northeast',
 'Mizoram':'Northeast','Nagaland':'Northeast','Tripura':'Northeast','Sikkim':'Northeast'}
ZMAP={'Mohammad Zaib':'Mohd Zaib','Krishna Kumar':'Krishna Kumar (Nakkani)','S.M SHAH':'Syed Mazher Shah',
      'Akhil Chandran':'Akhil B Chandran','Vaishnava Jyothi. Aragala':'Vaishnava Jyothi A','Sahil Anand':'Sahil A'}
DIMS=["soft_skills","brand_alignment","pitch_clarity","sales_skill","conversion_skill","discovery_quality","objection_handling","closing_discipline","overall"]

CLUSTERS={  # city (lowercase) -> business cluster; edit freely. Unmapped city falls back to region.
 'delhi':'Delhi-NCR','new delhi':'Delhi-NCR','gurugram':'Delhi-NCR','gurgaon':'Delhi-NCR','noida':'Delhi-NCR','greater noida':'Delhi-NCR','ghaziabad':'Delhi-NCR','faridabad':'Delhi-NCR',
 'mumbai':'Mumbai-Pune','navi mumbai':'Mumbai-Pune','thane':'Mumbai-Pune','pune':'Mumbai-Pune','pimpri-chinchwad':'Mumbai-Pune','pimpri chinchwad':'Mumbai-Pune',
 'bengaluru':'Bengaluru Metro','bangalore':'Bengaluru Metro',
 'hyderabad':'Hyderabad Metro','secunderabad':'Hyderabad Metro',
 'chennai':'Chennai Metro',
 'kolkata':'Kolkata Metro','howrah':'Kolkata Metro',
 'lucknow':'UP Heartland','kanpur':'UP Heartland','varanasi':'UP Heartland','prayagraj':'UP Heartland','allahabad':'UP Heartland','agra':'UP Heartland',
 'jaipur':'Rajasthan','jodhpur':'Rajasthan','udaipur':'Rajasthan','kota':'Rajasthan','ajmer':'Rajasthan',
 'ahmedabad':'Gujarat','surat':'Gujarat','vadodara':'Gujarat','rajkot':'Gujarat',
 'other':'Unspecified'}

def cluster_for(city, region):
    c=str(city or '').strip().lower()
    if c in CLUSTERS: return CLUSTERS[c], False
    if c in ('','other'): return ('Unspecified', False)
    return (region if region not in ('Unknown','') else 'Unspecified', True)

WEIGHTS={'Q':0.25,'Cv':0.25,'Cmp':0.15,'Lv':0.15,'Cav':0.20}
EXCLUDE={'Sourav Basu','Super Admin'}

# --- Org region taxonomy (analyst R1) ----------------------------------------
# Regions must be the org's 6 buckets, NOT a single "South". Map each lead to its
# region via the BD owner -> bd_org.json region (most reliable); fall back to a
# State -> org-region map when the owner is unknown/unmapped.
ORG_REGIONS=["North","South 1 (KA)","South 2 (AP & TG)","South 3 (TN & KL)","East","West"]
STATE_REGION={
 'karnataka':'South 1 (KA)',
 'andhra pradesh':'South 2 (AP & TG)','telangana':'South 2 (AP & TG)',
 'tamil nadu':'South 3 (TN & KL)','kerala':'South 3 (TN & KL)','puducherry':'South 3 (TN & KL)','pondicherry':'South 3 (TN & KL)',
 'maharashtra':'West','gujarat':'West','goa':'West',
 'delhi':'North','delhi (nct)':'North','new delhi':'North','delhi ncr':'North','haryana':'North','punjab':'North',
 'uttar pradesh':'North','up':'North','uttarakhand':'North','uttrakhand':'North','himachal pradesh':'North',
 'rajasthan':'North','jammu and kashmir':'North','jammu & kashmir':'North','chandigarh':'North',
 'madhya pradesh':'North','chhattisgarh':'North',
 'west bengal':'East','bihar':'East','jharkhand':'East','odisha':'East','assam':'East',
 'arunachal pradesh':'East','manipur':'East','meghalaya':'East','mizoram':'East',
 'nagaland':'East','tripura':'East','sikkim':'East'}
_ORG_REGION_MAP=None
def _load_org_regions():
    """owner-name (canonical + zohoName, lowercased) -> org region, from bd_org.json."""
    global _ORG_REGION_MAP
    if _ORG_REGION_MAP is not None: return _ORG_REGION_MAP
    m={}
    try:
        p=os.path.join(os.path.dirname(os.path.abspath(__file__)),'bd_org.json')
        org=json.load(open(p,encoding='utf-8'))
        for canon,v in org.get('bds',{}).items():
            reg=v.get('region')
            if not reg: continue
            m[canon.strip().lower()]=reg
            zn=(v.get('zohoName') or '').strip().lower()
            if zn: m[zn]=reg
    except Exception as e:  # noqa: BLE001
        print(f"  [WARN] dashboard_pipeline: bd_org.json not loaded ({e}); leads region falls back to State")
    _ORG_REGION_MAP=m
    return m
def region_for(owner, state):
    """Map a lead to an org region: BD owner -> bd_org region first, then State."""
    m=_load_org_regions()
    o=str(owner or '').strip().lower()
    if o and o in m: return m[o]
    st=str(state or '').strip().lower()
    if st in STATE_REGION: return STATE_REGION[st]
    return 'Other' if str(state or '').strip() else 'Unknown'

def _crm_phone_map(crm):
    crm=crm.copy(); crm['_phone']=crm['_phone'].astype(str).str.strip()
    # Ensure Source / DropReason columns exist (older CRM pulls may omit them)
    for _c in ('Source','DropReason'):
        if _c not in crm.columns: crm[_c]=''
    c=crm[crm['_phone']!=''].copy()
    prio={'Under Discussion':4,'Lead Contacted':3,'New Leads':2,'Lead Dropped':1}
    c['_pr']=c['Status'].map(prio).fillna(0)
    c=c.sort_values('_pr',ascending=False).drop_duplicates('_phone',keep='first')
    return {str(p):(o,s,src,dr) for p,o,s,src,dr in
            zip(c['_phone'],c['Owner'],c['Status'],c['Source'],c['DropReason'])}

def build_leads(df, crm):
    ph2=_crm_phone_map(crm)
    df=df.copy(); df['_phone']=df['_phone'].astype(str).str.strip()
    keycols=[col for col in df.columns if col.lower().startswith(('full_name','first name','last name','email'))][:6]
    tmask=pd.Series(False,index=df.index)
    for col in keycols: tmask=tmask|df[col].astype(str).str.lower().str.contains('test lead|dummy|<test',na=False)
    if '_state' in df.columns: tmask=tmask|df['_state'].astype(str).str.lower().str.contains('test lead|dummy|<test',na=False)
    d=df[(~tmask)&(df['_phone']!='')&(df['_date'].notna())].sort_values('_date').drop_duplicates('_phone',keep='first')
    def col(name): return d[name].tolist() if name in d.columns else ['']*len(d)
    phones=col('_phone'); dates=d['_date'].tolist(); states=col('_state'); cities=col('_city')
    brands=col('_brand'); props=col('_prop'); tiers=col('_tier')
    rows=[]
    for i in range(len(d)):
        ow,st,src,dr=ph2.get(str(phones[i]),(None,None,'',''))
        state=str(states[i] or '').strip()
        src=str(src or '').strip()
        rows.append({'dt':dates[i].strftime('%Y-%m-%d'),'state':state,
                     'region':REGION.get(state,'Other' if state else 'Unknown'),
                     'city':str(cities[i] or '').strip(),'brand':brands[i],
                     'owner':ow,'status':st,'prop':str(props[i] or '').strip(),'tier':str(tiers[i] or '').strip(),
                     'source':(src or 'Unknown'),'dropReason':str(dr or '').strip()})
        cl,ci=cluster_for(cities[i],rows[-1]['region']); rows[-1]['cluster']=cl; rows[-1]['ci']=ci
    return rows


def build_leads_from_crm(crm):
    """Build the lead universe directly from the Zoho CRM Leads module (all sources).

    Analyst L1: NO dedup. Every Zoho Lead is a lead — the universe is the full
    Leads module (~15.5k). The previous phone-dedup dropped ~2.7k records and the
    analyst confirmed that was wrong. Every Zoho Lead has an Owner, so assigned ==
    total and unassigned == 0. Owner/Status/Source/DropReason/Brand come straight
    off the CRM record; the real owner (incl Super Admin/Sourav Basu) is KEPT so
    totals stay complete — those two are excluded from per-BD stats downstream, not
    from totals. Region comes from the BD owner -> bd_org.json region, State fallback
    (analyst R1). No Tier is emitted (analyst L2)."""
    c=crm.copy()
    for col in ('Status','Owner','Source','DropReason','City','Brand','_state','_tier','_prop'):
        if col not in c.columns: c[col]=''
    if '_phone' not in c.columns: c['_phone']=''
    c['_phone']=c['_phone'].astype(str).str.strip()
    # Drop obvious test/dummy rows (defensive; Leads rarely carry them).
    tmask=pd.Series(False,index=c.index)
    for col in ('City','_state','Source'):
        tmask=tmask|c[col].astype(str).str.lower().str.contains('test lead|dummy|<test',na=False)
    c=c[~tmask].copy()
    if 'CreatedTime' in c.columns:
        c['_ct']=pd.to_datetime(c['CreatedTime'],errors='coerce')
    else:
        c['_ct']=pd.NaT
    # Analyst L1: NO phone dedup. Keep EVERY lead row as its own lead.
    d=c
    rows=[]
    for _,r in d.iterrows():
        state=str(r.get('_state') or '').strip()
        owner=str(r.get('Owner') or '').strip()
        region=region_for(owner,state)          # R1: owner -> org region, State fallback
        if not owner: owner=None                # keep real owner (incl EXCLUDE); assigned==total (L1)
        city=str(r.get('City') or '').strip()
        ct=r.get('_ct')
        dt=ct.strftime('%Y-%m-%d') if pd.notna(ct) else ''
        status=str(r.get('Status') or '').strip() or None
        src=str(r.get('Source') or '').strip() or 'Unknown'
        row={'dt':dt,'state':state,'region':region,'city':city,
             'brand':str(r.get('Brand') or '').strip(),
             'owner':owner,'status':status,
             'prop':str(r.get('_prop') or '').strip(),   # L2: no 'tier' key emitted
             'source':src,'dropReason':str(r.get('DropReason') or '').strip()}
        cl,ci=cluster_for(city,region); row['cluster']=cl; row['ci']=ci
        rows.append(row)
    return rows


CONT_STATUSES = {'Lead Contacted','Under Discussion'}
ACTIVE_STATUSES = {'Under Discussion'}
DROP_STATUSES = {'Lead Dropped'}


def build_leads_by_source(leads):
    """Aggregate leads by their Lead_Source into short-key counts.
    Shape: {'<Source>': {'l': total, 'c': contacted, 'a': active, 'd': dropped}}.
    'd' counts LEAD-stage drops only (Lead_Status='Lead Dropped'). Deal-stage
    drops live in deals.totals.dropped and are NOT attributed to lead sources
    (Deals.Lead_Source is mostly null/'NA' — see summary.leadsBySourceMeta)."""
    out={}
    for l in leads:
        src=(l.get('source') or 'Unknown') or 'Unknown'
        b=out.setdefault(src,{'l':0,'c':0,'a':0,'d':0})
        b['l']+=1
        stt=l.get('status')
        if stt in CONT_STATUSES:   b['c']+=1
        if stt in ACTIVE_STATUSES: b['a']+=1
        if stt in DROP_STATUSES:   b['d']+=1
    return out


def build_drop_reasons(leads):
    """Count dropped leads by their captured drop reason.
    Shape: {'<reason>': count}. Dropped leads with no reason are bucketed as 'Unspecified'."""
    out={}
    for l in leads:
        if l.get('status') in DROP_STATUSES:
            r=(l.get('dropReason') or '').strip() or 'Unspecified'
            out[r]=out.get(r,0)+1
    return out

def build_bds(zoom_agg, users, quality):
    by_canon={}
    for uid,a in zoom_agg.items():
        nm=users.get(uid,{}).get('name',uid); by_canon[ZMAP.get(nm,nm)]=a
    bd_uids=[u for u,m in users.items() if m.get('dept','').lower()=='business development']
    out={}
    for uid in bd_uids:
        nm=users[uid]['name']; canon=ZMAP.get(nm,nm)
        if canon in EXCLUDE: continue
        a=by_canon.get(canon,{'out':0,'conn':0,'rec':0,'dur':0})
        q=quality.get(canon)
        m=re.search(r'(\d+) calls?\)',q['method']) if q else None
        out[canon]={'reviewed':q is not None,
            'q':{k:q[k] for k in DIMS} if q else None,
            'low':bool(q.get('low_confidence',False)) if q else False,
            'cum':int(m.group(1)) if m else None,
            'zoom':{'out':a['out'],'conn':a['conn'],'rec':a['rec'],
                    'avg':round(a['dur']/a['conn']) if a['conn'] else None,
                    'connect_rate':round(a['conn']/a['out']*100,1) if a['out'] else None},
            'strength':q.get('strength','') if q else '','risk':q.get('risk','') if q else '','insight':q.get('insight','') if q else ''}
    return out

def assemble(df, crm, zoom_agg, users, quality, generated):
    leads=build_leads_from_crm(crm)  # universe = Zoho CRM Leads module (all sources)
    return {'generated':generated,'weights':WEIGHTS,'dims':DIMS,
            'leads':leads,'bds':build_bds(zoom_agg,users,quality),
            'regions':ORG_REGIONS,   # analyst R1 org taxonomy (South split 1/2/3)
            'leadsBySource':build_leads_by_source(leads),
            'dropReasons':build_drop_reasons(leads)}
