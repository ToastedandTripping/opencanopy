# OpenCanopy — Hand-off

**What this file is:** the volatile layer. What is in flight, what is owed, what is waiting on
Lee, and a short log. It is safe to rewrite *because nothing permanent lives here any more.*

| You want… | Read |
|---|---|
| Rulings, pins, operating constraints — anything decided | `.claude/DECISIONS.md` — **append-and-amend only** |
| Named work not yet scheduled | `ROADMAP.md` → **Parking Lot** |
| What shipped, and when | `ROADMAP.md` → `shipped` |

**Read `.claude/DECISIONS.md` before proposing anything.** Most of what looks like a fresh idea
in this project has already been ruled on, usually for a reason that is not obvious from the code.

---

## Owed right now

- **Merge + deploy Batch 1 COPY+CHROME** (relay/batch1-copy-chrome on the session branch). Razor PASS (0 CRITICAL), Jen PASS (6 CONCERNs for live QA). Merge to main + push = deploy. Lee's call.

- **Live browser QA** on five deployed relays the keyless sandbox could not verify: Phase A "honest timeline", a11y P2 cluster, CO2 calculator redesign, audit P0+P1 remediation, **Batch 1 COPY+CHROME** (preset chips active/inactive, attribution over gold, parks swatch reads green on mobile, legend labels, preset renames). Checklist: `~/marvin/state/opencanopy-a11y-p2-live-qa-2026-07-17.md` + the 07-15 hand-off.

- **Live QA on the docked-dolly landing page** (Lee, after deploy): scroll the whole story — the '35,000 hectares' red reveal lands with its panel, the page proceeds to the CTA with no dead stretch, 'Explore the Map' opens /map at the Clayoquot/Strathcona pocket with forest-age on. Mobile once.

## Open questions awaiting Lee

| Question | Why it matters | Raised |
|---|---|---|
| Live visual sign-off on Phase A "honest timeline": does a full 1917->2025 sweep finish in lockstep with the last fire patch painting? Also: mobile readout legibility, reduced-motion jump-to-end, histogram scent at a glance. | This is the exact honesty judgment the mechanism can't self-certify -- everything mechanical is already verified | 2026-07-18 |
| Live browser QA still owed on five deployed relays (a11y P2, CO2 calc, audit P0+P1, honest timeline, Batch 1) | Confirms the deployed changes work for a human on a real device | a11y P2: 2026-07-17; CO2 calc: 2026-07-16; audit P0+P1: 2026-07-11; Batch 1: 2026-08-26 |

### Resolved (2026-08-26, per Lee via coordinator)

- **Q1 (P6):** Keep hidden. Verify layer-by-layer before surfacing. Neither restore nor delete.
- **Q2 (PR2):** Rename Threats → Logging. Done in Batch 1.
- **Q3:** Expanded by default. Done in Batch 1.
- **Q4 (PR4):** Rename Protection → Old Growth + Parks. Done in Batch 1.
- **Q5 (PR5):** Switch to Forest age + parks (drop satellite). Done in Batch 1.
- **Q6 (T2):** SITE_INDEX not in VRI extract. Big-tree subset needs a data pull (Batch 4).
- **Sequence:** Confirmed global-state → B → C → D → E.
- **B.1 leaderboard:** Province-wide static.
- **B.2 harvest preset:** Fold into the logging preset, no separate chip.

---

## Log (newest first)

### 2026-08-26 -- Batch 1 COPY+CHROME shipped; charter adopted; Q1-Q6 resolved
13 visual-audit items on relay/batch1-copy-chrome: label renames (Old Growth → Stands 250+ yr VRI), layer ID renames (tap-deferrals → old-growth-250, conservation-priority → tap-priority) with backward-compatible aliases, parks swatch pre-multiply, satellite basemap indicator, preset chip emerald active state, legend expanded by default, attribution contrast, badge a11y, preset renames (Threats→Logging, Protection→Old Growth + Parks, Overview drops satellite). Lee's Q1-Q6 answers all folded. CHARTER.md adopted from the 2026-08-23 grill draft. Critic Opus (Fable rate-limited) PASS; Razor PASS (1 WARNING fixed); Jen Opus PASS (6 CONCERNs for live QA). 836 tests green. Sequence confirmed: global-state → B → C → D → E. Next: merge + deploy + live QA.

### 2026-08-22 -- /map visual layer audit complete; remediation program recorded
144 live captures (7 public layers + 4 presets × 9 views + baselines), PMTiles network timing per shot, two Jen (Fable) design passes + cross-check. Report artifact https://claude.ai/code/artifact/4e3b7b25-9897-4ac0-9955-6e4287d6416f; tracking checklist `research/map-visual-audit-2026-08-22.md` (35 findings with IDs, batches 0–5); program in ROADMAP `next:`. Lee's correction folded: legend detail exists on expand, so F1/K2/CH1 downgraded to default-state questions; the VRI caveat in `description` is still never on the map surface (F2/T2 stand). Six decisions await Lee (Q1–Q6). Batch 0 (two one-liners) is owed first.

### 2026-08-21 -- Ending dolly docked; landing page ends on the reveal
Lee's call: the landing page was trying too hard and keeping the project from /map. Cut the `remains` chapter and the `cameraTo` camera scrub from main (branch `story/retire-dolly`); the CTA's existing deep-link to STORY_END_CAMERA now carries the zoom. Both dolly versions preserved as annotated tags (`dock/dolly-live-scrub`, `dock/dolly-phase2-video`) with a restore recipe in the ROADMAP Parking Lot. Plan `.claude/plans/misty-waddling-hinton.md`, critic CONCERN -> 5 must-fixes folded, prefetch guard revert-proven, 816 tests + tsc + lint + build + reduced-motion e2e green. Awaiting Razor, merge, deploy, and Lee's live QA.

### 2026-08-21 -- Standing gates migrated out of the hand-off
Split the 11 "Standing Gates" by lifetime: three environment constraints plus the dolly do-not-merge and GFW hold-back rulings went to `.claude/DECISIONS.md` (append-and-amend only, created today); the eight held/deferred work items went to `ROADMAP.md -> Parking Lot`. This file is now the slim volatile layer. Same shape as the Fern migration of 2026-08-20, done before a rewrite could lose anything here.

### 2026-07-18 -- Phase A "honest timeline" shipped
Fixed a lying playhead: the /map timeline scrubber reached the end year while fire patches were still painting (86-91% dropped frames measured). Replaced the wall-clock `setInterval` with a render-gated loop keyed on `map.once('idle')`, so "speed" becomes a minimum dwell time. Added a comprehension layer (per-year scented histogram, cumulative-hectares readout, reduced-motion jump-to-end, SR announcements). Merged + deployed to `main` (`d647d70`); critic/Razor/Jen all on Fable, 803 tests. Live smoke-verified; the subjective lockstep-finish QA is still owed to Lee. The full /map improvement program (5 phases) is designed and waiting on Lee's go.

### 2026-07-17 -- P2 accessibility cluster shipped; deploy mechanism corrected
Shipped 8 WCAG findings (contrast, keyboard shortcuts, focus/dialog management, honest search/error states, mobile pinch-zoom fix) -- merged + deployed (`1e5253c`). Corrected a standing memory error: deploy is git-triggered (push to `main` auto-deploys via Netlify), not CLI-driven as two earlier sessions had logged. Jen's design-review gate moved onto Fable. Queued Phase A of the /map improvement plan as the next piece of work.

### 2026-07-15 (updated 07-16) -- Audit remediation + CO2 calculator redesign shipped
Two relays merged and deployed: audit P0+P1 remediation (a11y fix, /map re-render cascade fix, report-only CSP, CI gates) and a CO2 calculator rebuild (the old one silently showed a false "0 tonnes" -- replaced with a real WFS-based data path and honest status-driven messaging). A Fable-5 production audit graded the app D (one a11y FAIL, 31 WARN, otherwise clean). Live QA owed on both relays. A map-audit backlog flagged an un-actioned colorblind-accessibility issue (protanopia collapses the red/green encoding).

### 2026-07-10 -- Accumulated stack deployed
Deployed the font swap (Literata/Public Sans), Phase 1 scroll-story cleanup, and /map polish together to `main` (`eabfe3b`). Phase 2 dolly video held on the ffmpeg render (sandbox doesn't have ffmpeg -- Lee-terminal job). Phase 0 scrub-timing probes still pending. Corrected a stale capability note: the sandbox actually can push to main and deploy directly.

### 2026-07-05 -- Scroll-story Phases 0 and 1
Phase 0 (scrub-timing probe harness) shipped and merged. Phase 1 (dead-code removal, perf floor, 404-quieting on the scroll story) code-complete and Razor-passed, awaiting Lee's merge and deploy. Both are part of the multiphase scroll-story plan (`sharded-finding-beacon.md`), run one relay batch at a time on Lee's explicit go.

### 2026-06-29 -- Landing fix + dolly approach pivot
Moved the "we mapped it" beat from hero to CTA (merged locally, push pending). Lee redirected the dolly-performance fix entirely: instead of scroll-scrubbed frames, make the ending a self-playing animation that triggers on scroll-into-view (this makes pre-rendered video viable again). Flagged Beat 2 copy for a full rewrite ("poor copy... reads disjointed").

### 2026-06-28 -- Phase 1b shipped live
Regenerated the forest-base from real VRI data and shipped a binary end-reveal tile pipeline, replacing the hand-drawn forest blob and the old single-PNG overlay. Went live. Top open issue at the time: the ending dolly zoom drops tiles and lags on live -- a smoothing pass helped but didn't fix it (later superseded by the 06-29 approach pivot).

### 2026-06-27 -- Phase 1b problem identified
Diagnosed the render-pipeline problem behind the understated logging damage in the scroll story (blob-based forest base, too-low-res single-PNG overlay) and had a plan + critic review + probe ready to execute. Also logged a backlog of creative and production-audit deferrals (camera movement, footer mark, CSP, CORS, uptime monitoring) from a grade-C (63/100) production audit.
