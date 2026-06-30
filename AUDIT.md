# BD Dashboard — UI Stress Test & Data Audit

This is a **UI prototype** driven by mock data in `public/dashboard_data.js` (`window.DASH_DATA`).
All numbers below were checked against that mock dataset (15,000 leads, 20 BDs).
This document flags everything that must be reconciled before/while wiring **real BD data**.

Legend: CRITICAL (numbers are wrong / won't add up) · HIGH (mock shown as real / inconsistent) · MEDIUM (labels / multipliers) · HOUSEKEEPING

---

## [CRITICAL] 1. Status vocabulary mismatch in `src/lib/utils.ts` — root cause, affects every page

The dataset's real `status` values are:

```
New Leads, Lead Contacted, Under Discussion,
Site Visit Planned, Site Visit Done, Closure, Lead Dropped, (null)
```

But `utils.ts` defines:

```ts
CONT_STATUSES = { 'Lead Contacted', 'Under Discussion', 'Awaiting Business Approval' }
ACT_STATUSES  = { 'Under Discussion', 'Awaiting Business Approval' }
```

Problems:
- **`Awaiting Business Approval` does not exist** in the data (0 rows).
- **`Site Visit Planned`, `Site Visit Done`, `Closure` are ignored** — that's **37.5% of all assigned leads, including `Closure` (won deals)**.

Measured impact on the mock data:
- Contact rate computes to **25%** (should logically be ~87% — anyone at Site Visit/Closure was obviously contacted).
- Active rate computes to **12.1%** (only `Under Discussion`); **won deals at `Closure` are counted as neither active nor won anywhere.**

This single mismatch propagates into: Overview KPIs (Contact Rate, "Win Rate", Projected Revenue), the whole Leaderboard (scores, Active %, bands), Reporting active-deal counts, Compare secured-revenue/win-rate, Geography health colors, and the Pipeline page.

**Fix:** redefine `CONT_STATUSES` / `ACT_STATUSES` (and add a `WON_STATUSES`) to match the real funnel, **or** have the integrator map their CRM statuses onto these sets in one place. The status taxonomy must be agreed before the numbers mean anything.

---

## [CRITICAL] 2. Two different definitions of "active" on the same Overview page

- KPI cards ("Projected Revenue", "Win Rate", "Contact Rate") use `calculateRates()` → active = `Under Discussion` only.
- The **"Revenue Velocity Trend"** chart and **"Strategic Market Penetration"** chart use a *different* inline set: `Site Visit Done | Site Visit Planned | Closure | Under Discussion`.

So "Secured Revenue" (charts) and "Projected Revenue" (card) describe the same idea with different math and **won't reconcile (off by ~3x)**. Pick one definition and use it everywhere.

---

## [CRITICAL] 3. Pipeline Stages page only represents ~37% of leads

`src/app/pipeline/page.tsx` `STAGES` = `Lead Contacted, Under Discussion, Awaiting Business Approval, Lead Dropped`.
It **omits** `New Leads`, `Site Visit Planned`, `Site Visit Done`, `Closure`, and null.

Result: the "By Region", "By Tier", and the Overview "Total Leads" only sum ~5,600 of 15,000 leads and **exclude every won deal**. The page claims to show "where every lead sits" but is missing most stages.

**Fix:** `STAGES` must include the full real funnel (e.g. New -> Contacted -> Under Discussion -> Site Visit Planned -> Site Visit Done -> Closure, with Lead Dropped as fall-out). *(Note: the new Overview/Executive-Summary blocks were built on top of the existing `STAGES`, so they inherit this gap and will be correct once `STAGES` is completed.)*

---

## [CRITICAL] 4. Reporting "Pipeline Funnel" (location view) mis-buckets statuses

In `reporting/page.tsx` the macro-stage keyword mapping resolves the real statuses as:

| Real status | Mapped to | Correct? |
|---|---|---|
| New Leads / null | Discovery | ok |
| Lead Contacted | Discovery | ok |
| **Under Discussion** | **Other** | NO — should be Engagement |
| Site Visit Planned/Done | High Intent | ok |
| Closure | Won | ok |
| **Lead Dropped** | **Other** | NO — should be Lost |

So the funnel shows a meaningless gray **"Other"** slice (which is actually Under Discussion + Dropped) and the **"Engagement" bucket is always empty** (no status maps to it). The colors therefore misrepresent the pipeline.

---

## [HIGH] 5. "Executive Insights" dropdown is 100% hardcoded narrative

`src/components/InsightsDropdown.tsx` -> `CATEGORIES` is fully static text. It states fabricated figures ("1,420 leads stalled", "Tier 1 converts 36% faster", "92/100 Balanced Score") and references rep names that **do not exist in the data**: *Harshit S., Arjun K., Suresh P., Vikram M.*

Real owners are: *Ajith KS, Akhil B Chandran, Amrit Mishra, ...* (20 total).

It looks authoritative and data-driven but will **not** update with real data, and it **contradicts** the real data (e.g. it claims Tier 1 converts faster; the mock data shows tier conversion is essentially flat at ~12%). High risk in front of executives. Either make it data-driven or clearly mark it illustrative / remove it for the real build.

## [HIGH] 6. Pipeline "Top BDs" uses hardcoded mock names

`MOCK_BD_DATA` (Harshit S., Arjun K., Neha R., ...) is invented and differs from the real owners shown on Overview/Leaderboard. It's labeled "Mocked Data," but a viewer sees one set of names here and a completely different set elsewhere. Wire it to `buildLeaderboard(...)` like the other pages.

## [HIGH] 7. Brand filter for "Open Hotels" is broken (Reporting + Geography)

Brand-search logic compares against the lowercase token `'open'`, but the data's brand value is `'Open Hotels'`:
- Reporting brand-comparison chart: the **"Open" line is always 0** (key `'open'` never matches `'open hotels'`).
- Brand filtering returns nothing for Open Hotels in both Reporting and Geography.
- `Olive` and `Spark` work because their single-word names match.

**Fix:** match on the real brand string (`'Open Hotels'`) instead of `'open'`.

## [HIGH] 8. "Ask AI" is a mocked backend

`src/components/AskAI.tsx` self-labels "(Note: The AI reasoning backend is mocked for this UI build.)". Fine as a placeholder, but it does nothing — wire to a real endpoint or hide for the real build.

---

## [MEDIUM] 9. Hardcoded multipliers & mislabels on Overview

- **`AVG_DEAL_SIZE = $12,500`** is an invented constant (duplicated in 5 files: `page.tsx`, `compare`, `geography`, `reporting`, `pipeline`). **Every "$" figure in the app is `leadCount x 12,500`, not real revenue.** Centralize it and replace with real deal values.
- **"+2.4% vs Last Quarter"** (Win Rate card) is static text.
- **"Sales Cycle Velocity = 18 days"** is a static constant, not computed.
- **"Aggregate Win Rate"** is actually *active rate* (active / total leads), not a true win rate (won / total). Mislabeled.
- **"Total Pipeline Value"** counts every lead — including dropped and unassigned — at $12,500.

## [MEDIUM] 10. "Last 90 days" label is inaccurate

`ContextBar` always prints "All data · Last 90 days," but **no default date filter is applied** and the data spans ~4 months (2026-03 -> 2026-06). It's a cosmetic label only.

## [MEDIUM] 11. Color semantics to revisit after the status fix

- Pipeline stage colors put the prominent **brand-pink on "Awaiting Approval"** (0 rows -> pink never shows), while the real active stage "Under Discussion" gets a muted violet. Reassign once stages are corrected.
- Geography health thresholds (>=15% green, >=10% amber, else red) are tuned to the narrow ~12% active rate, so nearly every city renders amber/red. Retune if the active definition widens.
- Brand color for "Open Hotels" is inconsistent: emerald in the Reporting brand chart vs purple elsewhere.

---

## [HOUSEKEEPING] 12

- `src/components/KPICard.tsx` is **dead code** (never imported; Overview uses a local `FinancialCard`).
- BD records carry precomputed `band` and `role` fields the app ignores (band is recomputed from score).
- `zoom` objects in the data have `out/conn/rec` only; the `BD.zoom` TS type also lists `avg`/`connect_rate` (harmless because JSON is untyped, but the type and data diverge).

---

## What is correct / safe

- Lead `owner` values exactly match the 20 `bds` keys -> the leaderboard join is clean.
- Scoring weights sum to 1.0 -> balanced score lands 0–100 and the band thresholds (72 / 63 / 54) are sensible.
- Filters (region, brand, tier, owner, status, date) wire correctly through `DashboardContext`.
- `buildLeaderboard()` math is sound **given a correct status set**.
- Tier is a pass-through label (Tier 1/2/3/Unknown) — evenly split in mock data, so the "By Tier" views will look flat until real data arrives.
- Compare winner logic, Geography map join, and the radar/skill views all function.

---

## Suggested fix order for integration

1. Agree the **status taxonomy** and fix `CONT/ACT/WON` sets in `utils.ts` (unblocks #1, #2, #4, and most number issues).
2. Complete Pipeline `STAGES` (#3) and re-color (#11).
3. Replace `AVG_DEAL_SIZE` with real deal value; centralize the constant (#9).
4. Wire Pipeline "Top BDs" to real leaderboard (#6); fix Open Hotels brand matching (#7).
5. Make or remove "Executive Insights" / "Ask AI" (#5, #8).
6. Fix labels: true win rate, sales cycle, remove "Last 90 days" / "+2.4%" placeholders (#9, #10).
