#!/usr/bin/env python3
"""refresh_zoom_cache.py — rebuild the trailing-90-day Zoom Phone call-log cache.

Standalone, idempotent refresher for the four cache files that
``refresh_leads_live.cached_zoom()`` consumes to power the dashboard's
"calling quality" card:

    _z90c_A.json  _z90c_B.json  _z90c_C.json   (three ~30-day call-log shards)
    _zoom_users_dept.json                       (Zoom Phone user directory)

Design notes
------------
* Credential logic is NOT duplicated here — we import ``run_digest`` and reuse
  its ``_zoom_token()`` server-to-server OAuth helper (grant_type=
  account_credentials, account_id + base64 client_id:client_secret). It reads
  ZOOM_ACCOUNT_ID / ZOOM_PHONE_CLIENT_ID / ZOOM_PHONE_CLIENT_SECRET from the env.
* The trailing 90 days are pulled in three adjacent, non-overlapping ~30-day
  windows (Zoom's call_logs endpoint caps a single query at 30 days). These map
  1:1 to the A/B/C shards, exactly as the original frozen cache was built:
      A = [today-90, today-61]
      B = [today-60, today-31]
      C = [today-30, today]
* Each shard is written in the exact schema cached_zoom() expects:
      {"done": bool, "npt": "", "agg": {uid: {out, conn, rec, dur}},
       "ids": [call_id, ...], "window": ["YYYY-MM-DD", "YYYY-MM-DD"]}
  cached_zoom() only reads ``agg``; the other keys preserve the original
  shard/checkpoint semantics (window bounds + de-dup id set).
* Aggregation semantics match build_dashboard.fetch_zoom_90d exactly:
  outbound calls only; a call counts as connected only when its result is in
  CONNECTED *and* duration > 0 (Zoom's portal excludes duration-0 ghost
  connects); recorded when the result is in RECORDED.

Usage
-----
    python refresh_zoom_cache.py [--out DIR]

Exits non-zero on failure (missing credentials, or empty aggregates that would
overwrite the cache with garbage).
"""
import os
import sys
import json
import time
import argparse
import datetime
from collections import defaultdict

import requests

BASE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE)
import run_digest as rd  # noqa: E402 — reuse _zoom_token(); DO NOT duplicate credential logic

API = "https://api.zoom.us/v2"

# Result values that count as a live-answered outbound call. Duration > 0 is
# additionally required for "connected" so duration-0 ghost connects are excluded
# (matches build_dashboard.fetch_zoom_90d and the Zoom portal's Connected count).
CONNECTED = {"Auto Recorded", "Call connected", "Recorded"}
RECORDED = {"Auto Recorded", "Recorded"}


def _get(url, headers, params, max_retries=6):
    """GET with backoff for 429 (rate limit) and transient 5xx responses."""
    delay = 2.0
    last = None
    for attempt in range(max_retries):
        try:
            r = requests.get(url, headers=headers, params=params, timeout=60)
        except requests.RequestException as e:
            last = e
            print(f"  [retry] network error on {url}: {e} — "
                  f"sleeping {delay:.0f}s (attempt {attempt + 1}/{max_retries})")
            time.sleep(delay)
            delay = min(delay * 2, 60)
            continue
        if r.status_code == 429 or 500 <= r.status_code < 600:
            ra = r.headers.get("Retry-After", "")
            wait = float(ra) if ra.isdigit() else delay
            print(f"  [retry] HTTP {r.status_code} on {url} — "
                  f"sleeping {wait:.0f}s (attempt {attempt + 1}/{max_retries})")
            time.sleep(wait)
            delay = min(delay * 2, 60)
            continue
        return r
    if last is not None:
        raise last
    raise RuntimeError(f"exhausted retries for {url}")


def fetch_users(token):
    """All Zoom Phone users -> {uid: {name, ext, dept}}.

    Not department-filtered (the department filter is applied downstream in
    dashboard_pipeline.assemble); this mirrors the frozen _zoom_users_dept.json,
    which contains every provisioned Phone user.
    """
    h = {"Authorization": f"Bearer {token}"}
    meta = {}
    npt = None
    while True:
        p = {"page_size": 100}
        if npt:
            p["next_page_token"] = npt
        r = _get(f"{API}/phone/users", h, p)
        if r.status_code == 204:
            break
        r.raise_for_status()
        js = r.json()
        for u in js.get("users", []):
            uid = u.get("id")
            if not uid:
                continue
            name = u.get("name") or (
                str(u.get("first_name", "")) + " " + str(u.get("last_name", ""))
            ).strip()
            meta[uid] = {
                "name": name,
                "ext": str(u.get("extension_number", "") or ""),
                "dept": (u.get("department", "") or "").strip(),
            }
        npt = js.get("next_page_token", "")
        if not npt:
            break
    return meta


def fetch_window(token, frm, to):
    """Aggregate outbound call stats for a single <=30-day window.

    Returns (agg, ids): agg={uid: {out, conn, rec, dur}}, ids=sorted list of the
    de-duplicated call ids seen in the window.
    """
    h = {"Authorization": f"Bearer {token}"}
    agg = defaultdict(lambda: {"out": 0, "conn": 0, "rec": 0, "dur": 0})
    seen = set()
    npt = None
    while True:
        p = {"from": frm.isoformat(), "to": to.isoformat(), "page_size": 300}
        if npt:
            p["next_page_token"] = npt
        r = _get(f"{API}/phone/call_logs", h, p)
        if r.status_code == 204:
            break
        r.raise_for_status()
        js = r.json()
        for c in js.get("call_logs", []):
            cid = c.get("id") or c.get("call_id")
            if cid and cid in seen:
                continue
            if cid:
                seen.add(cid)
            uid = c.get("user_id", "")
            if not uid:
                continue
            if (c.get("direction") or "").lower() == "outbound":
                res = c.get("result") or ""
                dur = int(c.get("duration") or 0)
                a = agg[uid]
                a["out"] += 1
                if res in CONNECTED and dur > 0:
                    a["conn"] += 1
                    a["dur"] += dur
                if res in RECORDED:
                    a["rec"] += 1
        npt = js.get("next_page_token", "")
        if not npt:
            break
    return dict(agg), sorted(seen)


def _windows(today):
    """Three adjacent, non-overlapping 30-day windows over the trailing 90 days."""
    d = datetime.timedelta
    return [
        ("A", today - d(days=90), today - d(days=61)),
        ("B", today - d(days=60), today - d(days=31)),
        ("C", today - d(days=30), today),
    ]


def _write_json(path, obj):
    """Atomic write — never leaves a truncated shard behind on failure."""
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(obj, f, separators=(",", ":"), default=str)
    os.replace(tmp, path)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", default=BASE,
                    help="output directory for the cache files (default: this script's dir)")
    args = ap.parse_args()
    out = os.path.abspath(args.out)
    os.makedirs(out, exist_ok=True)

    token = rd._zoom_token()
    if not token:
        print("ERROR: Zoom credentials not configured — need ZOOM_ACCOUNT_ID, "
              "ZOOM_PHONE_CLIENT_ID and ZOOM_PHONE_CLIENT_SECRET in the environment.",
              file=sys.stderr)
        return 2

    today = datetime.date.today()
    print(f"Zoom cache refresh — trailing 90 days ending {today.isoformat()} -> {out}")

    # Users first: cheap, and it validates the token before the heavy pulls.
    users = fetch_users(token)
    _write_json(os.path.join(out, "_zoom_users_dept.json"), users)
    print(f"  users: {len(users)}")

    total_out = 0
    active = set()
    for key, frm, to in _windows(today):
        agg, ids = fetch_window(token, frm, to)
        shard = {
            "done": True,
            "npt": "",
            "agg": agg,
            "ids": ids,
            "window": [frm.isoformat(), to.isoformat()],
        }
        _write_json(os.path.join(out, f"_z90c_{key}.json"), shard)
        wout = sum(v["out"] for v in agg.values())
        total_out += wout
        active |= set(agg)
        print(f"  shard {key} [{frm} -> {to}]: users={len(agg)} "
              f"calls={len(ids)} outbound={wout}")

    print(f"SUMMARY: users={len(users)} active_callers={len(active)} "
          f"total_outbound={total_out} window=90d ending {today.isoformat()}")

    # Guard: refuse to publish an empty cache over a good one.
    if len(users) == 0 or total_out == 0:
        print("ERROR: empty aggregates (0 users or 0 outbound calls) — refusing to "
              "overwrite the cache with garbage.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
