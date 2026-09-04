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

- **Live browser QA** on six deployed relays the keyless sandbox could not verify: Phase A "honest timeline", a11y P2 cluster, CO2 calculator redesign, audit P0+P1 remediation, **Batch 1 COPY+CHROME** (preset chips, attribution, parks swatch, legend labels, preset renames), **global-state year** (play 1917→2025 with 3+ layers, confirm bar-map lockstep preserved — this is the render-gate contract test that can't be unit-tested). Checklist: `~/marvin/state/opencanopy-a11y-p2-live-qa-2026-07-17.md` + the 07-15 hand-off.

- **Live QA on the 2026-09-02 deploy** (Lee, phone once): the hero now reads '5.8 million hectares ... larger than Nova Scotia' (verify the Nova Scotia comparison, ~5.5M ha, was from memory); the story's red overlay lost the large grey/maroon tenure blocks (Haida Gwaii, Kootenays, the northeast) — cutblock texture otherwise unchanged; the CO2 panel's 'Unknown age' bar reads 'excluded from all values'; /privacy names ssc-ops.netlify.app and screen size. This deploy also carried Batch 1 COPY+CHROME, the global-state year uniform and the docked-dolly landing — the earlier live-QA lists still apply.

- **One relay for the three DataLayer public-path bugs** before Batch 2 (paint re-spine) edits the same effects: R1-02 timeline ticks dropped behind `isStyleLoaded()` (page.tsx:326), R1-03 stale-status clear below the tile-backed early return (DataLayer:1143), R1-05 PmtilesLayers stale-closure visibility (SatelliteLayers' `visibleRef` pattern). Ship with the rendered PmtilesLayers tests that do not exist yet (d10 harness + mock `_emit`; add `calls.setGlobalState` to the mock). Findings: `.refresh/2026-09-01-findings/findings-R1.jsonl`.

- **Small routed fixes** (any session): PDF footer 'see methodology at opencanopy.ca' points at no route (pdf-generator.ts:287); `audit:live` asserts tenure-cutblocks and fish-streams, both non-public, so two monitor tests fail by construction (live-health.spec.ts:170-266); wfs-client finally-block bookkeeping race (wfs-client.ts:137-143, non-public layers only). `npm i -D @mapbox/vector-tile pbf @types/geojson` (transitive today via maplibre-gl; a MapLibre 6 bump breaks the tile audits otherwise) — classifier blocks installs from a session.

- **Local checkout**: `~/Projects/opencanopy` main is behind origin (fce8c84); `git pull` there before the next worktree spawns, or it forks off stale history again (this session started on the docked dolly branch).

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

### 2026-09-02 -- Code refresh merged + live; three charter fixes on Lee's rulings

Second-generation `/code-refresh` (report `.refresh/2026-09-01.md`, raw findings `.refresh/2026-09-01-findings/`): four Fable readers, 74 findings, 16 commits fast-forwarded to main (`fce8c84`) and live 2026-09-02. Applied: dead code (-424 lines), dedups the 08-05 pass left half-done, six hollow audit tests replaced with mutation-proven guards (popup keys had drifted from MapPopup while green; zoom-handoff could not fail; legend colours and the 2,000 ha cutblock cap now single-sourced and cross-pinned to the proxy), a CSS guard for the June reduced-motion crash, docs reconciled (README claimed 17 public layers against CHARTER non-goal 2; CONTRIBUTING's recipe produced an invisible layer; METHODOLOGY described the dead queryRenderedFeatures path; the dolly restore recipe already conflicted). Razor equivalence review PASS-WITH-WARNINGS, all ten mutation claims reproduced. CI on main had been red since 08-22 on `npm audit` alone; lockfile patched, green again.

Lee's rulings (2026-09-02), applied with guards: (1) hero figure 8M -> 5.8M ha — recomputed from the FTEN checkpoint; the 230 polygons at 2,000-92,000 ha are tenure boundaries the /map layer already excludes but the story never did (the scrub table summed 7.06M, the overlays painted 2.45M ha of tenure polygons red/maroon); cap now applied in build-scrub-tables.py + build-year-overlays.py, scrub JSON + 76 PNGs regenerated; 'larger than Nova Scotia' replaces Ireland. Rule: underestimate rather than state a number we cannot source. (2) Unknown-age stands contribute to no value (were: zero carbon, full stumpage, full services). (3) tracker.js vendored into public/ so the privacy page's 'source is in this repo' is true; page names the receiving host and the fields it sends.

Routed, not done: three DataLayer public-path bugs (one relay, before Batch 2), PDF methodology pointer, two hollow live-monitor tests, wfs-client race, ten relay-sized refactors (see the report's bucket B). Session traps recorded in memory: the worktree had forked from `dolly/phase2-video`; the classifier blocks `git push :main` and `npm audit fix` from a session (Lee pushed with the `!` prefix); the overlay build needs ~35 min and 12 GB, detached.

### 2026-08-27 -- Phase B reconciliation: rebase-and-adjust, not a rebuild

`relay/phase-b-harvest` (2026-08-09, complex tier, 5 Ted batches, 31 files, +8219/-228, Razor 3 CRITICALs all closed, Jen spec + PASS) already exists and is complete-unmerged. Lee's B.1/B.2 rulings from 2026-08-26 postdate it by 17 days. Comparison:

**B.1 (province-wide STATIC leaderboard):** MATCH. Phase B built exactly this — plan D2: "province-wide, build-time, exact." `scripts/build-harvest-leaderboard.ts` produces `src/data/harvest-leaderboard.json` at build time, top 5 + Other + undated.

**B.2 (fold harvest into the logging preset, no separate chip):** MATCH. Phase B plan D4: "no dedicated Accountability preset chip; accountability rides along in threats + fire-logging." Both Logging (was Threats) and Fire+Logging get harvest with forest-age harvested-class suppressed via `classFilters`. Lee's singular "the logging preset" is ambiguous but fire-logging inclusion is natural — no conflict.

**Verdict: REBASE-AND-ADJUST.** The substance is aligned. The conflicts are mechanical — three layers of changes on this session branch postdate Phase B's fork point:

1. **Batch 1 renames:** presets.ts (Threats→Logging, Protection→Old Growth+Parks), registry.ts (tap-deferrals→old-growth-250, conservation-priority→tap-priority), legend expanded-by-default, preset chip styling, parks swatch, satellite legend, attribution CSS. Phase B's preset file uses the old names/ids.
2. **Global-state API:** filter-expressions.ts signatures changed (buildYearFilter/buildAgeGradedOpacity dropped the year param). DataLayer.tsx filter effect restructured (timelineActive boolean deps). Phase B calls the old API.
3. **Test file conflicts:** Both branches modified contrast-audit, schema-audit, satellite-zorder, data-layer-memo tests.

Estimated rebase effort: ~2-3 hours as a dedicated relay (resolve merge conflicts, update Phase B's code to the new API surface, re-run all gates). No design decisions need revisiting — the plan's substance is what Lee asked for. The rebase is deferred until the session branch's three unmerged layers are deployed, so the fork point is stable.

### 2026-08-27 -- Global-state year uniform shipped (stacked on Batch 1)
MapLibre 5.21 setGlobalStateProperty replaces per-layer setFilter for the timeline year. 1 call per year tick instead of 2N. DataLayer filter effect fires on timeline on/off, not every year tick. filter-expressions API simplified (drop year param). Render-gate preserved (verified setGlobalStateProperty triggers repaint/idle). Razor PASS (0 CRITICAL, 1 WARNING: style-loaded coupling — not a ship-blocker). 836 tests green. Stacked on the unmerged Batch 1. Next in Lee's sequence: Phase B (harvest consolidation + accountability).

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
