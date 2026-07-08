#!/usr/bin/env python3
"""Live-leads refresh for the public dashboard.

Pulls the Partner-With-Us sheet + Zoho CRM LIVE (the numbers that move during the
day), reuses the most recent cached Zoom call aggregates and the daily AI coaching
scores (those are batch by nature), assembles dashboard_data.json, and optionally
publishes it to the live data feed the website reads.

It deliberately does NOT re-fetch Zoom's 90-day call logs (slow) or recompute
coaching scores (LLM) — those come from the daily digest's caches/files.

  python refresh_leads_live.py            # rebuild dashboard_data.json (live leads)
  python refresh_leads_live.py --publish  # also push it to the 'data' branch feed

Reuses your existing modules (run_digest.fetch_sheet / fetch_crm, dashboard_pipeline.assemble),
so there is no second copy of the pipeline logic to keep in sync.
"""
import os, sys, json, datetime, subprocess, shutil
from collections import defaultdict

BASE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE)
import run_digest as rd            # noqa: E402  — your existing live fetchers
import dashboard_pipeline as dp    # noqa: E402  — your existing assemble()


def cached_zoom():
    """Reuse the Zoom 90-day aggregates the daily digest already computed."""
    agg = defaultdict(lambda: {"out": 0, "conn": 0, "rec": 0, "dur": 0})
    for k in ["A", "B", "C"]:
        p = os.path.join(BASE, f"_z90c_{k}.json")
        if not os.path.exists(p):
            continue
        c = json.load(open(p))
        for uid, v in c.get("agg", {}).items():
            for kk in ["out", "conn", "rec", "dur"]:
                agg[uid][kk] += v.get(kk, 0)
    users_p = os.path.join(BASE, "_zoom_users_dept.json")
    users = json.load(open(users_p)) if os.path.exists(users_p) else {}
    return dict(agg), users


def load_quality():
    p = os.path.join(BASE, "bd_quality_scores.json")
    if not os.path.exists(p):
        return {}
    return {k: v for k, v in json.load(open(p)).items() if k != "_meta"}


def build():
    # The Partner-With-Us Google Sheet is no longer the lead universe (leads now come
    # from the Zoho CRM Leads module via dashboard_pipeline.build_leads_from_crm), so
    # assemble() ignores this df entirely. Fetching the sheet is therefore optional:
    # set SKIP_SHEET=1 (used by the GitHub Action) to skip it, and any fetch failure
    # degrades to an empty df rather than breaking the run. Lead counts are unaffected.
    import pandas as pd
    df = pd.DataFrame()
    if os.getenv("SKIP_SHEET", "").lower() not in ("1", "true", "yes"):
        try:
            print("Fetching Partner-With-Us sheet (live) ...")
            df = rd.fetch_sheet()
        except Exception as e:  # noqa: BLE001
            print(f"[WARN] sheet fetch skipped ({e}); continuing with CRM-only leads")
    else:
        print("SKIP_SHEET set — skipping Google Sheet fetch (CRM is the lead universe)")
    print("Fetching Zoho CRM (live) ...")
    crm = rd.fetch_crm()
    agg, users = cached_zoom()
    quality = load_quality()
    gen = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    data = dp.assemble(df, crm, agg, users, quality, gen)
    out = os.path.join(BASE, "dashboard_data.json")
    json.dump(data, open(out, "w"), separators=(",", ":"), default=str)
    print(f"Wrote dashboard_data.json | leads={len(data['leads'])} bds={len(data['bds'])} | {gen}")

    # Build deals.json + proposals.json FIRST so summary.json can embed compact
    # aggregates from them (the Ask-AI feed must know deals/signings/TA-fees/proposals).
    # Best-effort: a Deals/Proposals hiccup must not break the leads feed.
    deals = None
    try:
        import build_deals as bd
        recs = bd.fetch_deals()
        deals = bd.build_deals(recs, gen)
        json.dump(deals, open(os.path.join(BASE, "deals.json"), "w"), separators=(",", ":"), default=str)
        print(f"Wrote deals.json | deals={deals['totals']['deals']} signed={deals['totals']['signed']} "
              f"| YTD signings={deals['ytd']['signings']['count']} upcoming={len(deals['upcoming'])} "
              f"ranked={len(deals['ranking']['bds'])}")
    except Exception as e:  # noqa: BLE001
        print(f"[WARN] deals.json build skipped: {e}")

    proposals = None
    try:
        import build_proposals as bp
        precs = bp.fetch_proposals()
        proposals = bp.build_proposals(precs, gen)
        json.dump(proposals, open(os.path.join(BASE, "proposals.json"), "w"), separators=(",", ":"), default=str)
        print(f"Wrote proposals.json | proposals={proposals['totals']['proposals']} approved={proposals['totals']['approved']}")
    except Exception as e:  # noqa: BLE001
        print(f"[WARN] proposals.json build skipped: {e}")

    # Now emit the small pre-aggregated summary.json for the Ask-AI / Gemini feed,
    # embedding the freshly built deals + proposals aggregates.
    import build_summary as bs
    summ = bs.build_summary(data, deals, proposals)
    json.dump(summ, open(os.path.join(BASE, "summary.json"), "w"), separators=(",", ":"), default=str)
    print(f"Wrote summary.json | {len(summ['leaderboard'])} BDs, {len(summ['trend'])} months, "
          f"deals={'yes' if summ.get('deals') else 'no'} proposals={'yes' if summ.get('proposals') else 'no'}")
    return out


def publish(json_path):
    """Push the JSON to the app repo's 'data' branch so the live feed updates WITHOUT
    triggering a site rebuild. One-time setup creates the worktree (see
    SETUP_LIVE_DASHBOARD.md)."""
    feed_dir = os.path.join(BASE, "_feed")  # git worktree checked out to the orphan 'data' branch
    if not os.path.isdir(feed_dir):
        print("Live feed not set up yet (missing _feed worktree). See SETUP_LIVE_DASHBOARD.md. Skipping publish.")
        return
    # Publish every feed the site reads, keeping them in one atomic commit.
    published = []
    for fname in ("dashboard_data.json", "summary.json", "deals.json", "proposals.json", "bd_org.json"):
        src = os.path.join(BASE, fname)
        if os.path.exists(src):
            shutil.copyfile(src, os.path.join(feed_dir, fname))
            subprocess.run(["git", "add", fname], cwd=feed_dir, check=True)
            published.append(fname)
    print("Staging for publish:", ", ".join(published))
    done = subprocess.run(["git", "commit", "-m", "live data refresh"], cwd=feed_dir)
    if done.returncode == 0:
        subprocess.run(["git", "push", "origin", "data"], cwd=feed_dir, check=True)
        print("Published to live feed (data branch). The site will pick it up within ~10 minutes.")
    else:
        print("No change since last publish — nothing to push.")


def main():
    out = build()
    if "--publish" in sys.argv:
        publish(out)


if __name__ == "__main__":
    main()
