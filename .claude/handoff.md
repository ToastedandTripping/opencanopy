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

- **Lee's phone checks (two, the July backlog cut per the 2026-10-07 grill):** (1) Batch 1 COPY+CHROME: preset chips, attribution, parks swatch, legend labels, preset renames; (2) the 2026-09-02 story changes: hero reads '5.8 million hectares ... larger than Nova Scotia' (the ~5.5M ha comparison was from memory), the large tenure blocks are gone from the red overlay, the CO2 panel's 'Unknown age' bar, /privacy names ssc-ops.netlify.app. Owed, never blocking.

- **Agent checks on production** (headless, per the 2026-10-07 amendment): a11y P2 cluster (contrast, keyboard shortcuts, focus/dialog, pinch-zoom) and audit P0+P1 (CSP report-only, re-render cascade, CI gates). Timeline lockstep (Phase A, global-state year) is an acceptance condition of M1a's timeline guard, not a separate check. The CO2 calculator check is retired: K rebuilds it.

- **Ending-video review (2026-10-07, in progress):** all three docked versions rendered for the first time, in throwaway worktrees under `/tmp/claude-1000/-home-leesalo--local-share-marvin-worktrees-opencanopy-canopy/38525f5e-10fe-44aa-916f-99970f16ebe9/scratchpad/renders/` (v1 = dock/dolly-live-scrub, v2 = dock/dolly-phase2-video, v3 = relay/story-video-phase2-render-spec). Sent to Lee: v1 phone + desktop recordings, v2 desktop + mobile video, today's live site. v3 (whole story, ~1-2 h) was rendering when the session paused; output lands in `renders/v3/.render-scratch/story-video/out/`. v2 shipped a real bug: StoryMap's binary-reveal effect drops its write when the style is not loaded and never retries, so a constant-opacity render page renders the reveal at 0 (patched in the throwaway copy only). The worktrees are throwaway; remove with git worktree remove once Lee has seen v3. Concept B spike sketch: https://claude.ai/artifact/VEMwA8EADqLbKQcCzw8A3j (sample comment count; the dated-record curve is ~89% after 2000, a pacing question for S1-lite).

- **Dot layer for the intro spike (Lee, 2026-10-09: swap in after Ted's mechanics land):** build first-year-encoded blue-noise dot images per dataset (VRI 1900-1999, FTEN 2000-2025, fire 2017-2025) from research/overpaint-2026-10-08/scripts (yearencode.py / province.py), decode on the CPU into a MapLibre canvas source, hand over to /map's vector cutblocks from z8. Load during the hero (~21 kB cutblocks). Disclosure line in the beat sheet.

- **Intro-film spike, state at the usage limit (2026-10-09):** branch spike/intro-animation (worktree ~/.local/share/marvin/worktrees/opencanopy/intro-spike, unpushed). Done: /intro-lab end to end, area-true dots (within 1.25% since 2001), z9-10 blank and chip fixes, 913 tests. Queued with Ted when the session stopped: (1) tuning round: ~90 s per variant, beat 3 copy now "1900 to 1959, condensed: 166,000 hectares, early logging undercounted." (Lee-approved), beat 6 = 1,009 squares from splice.json, start trigger unchanged, NO hand-off fade (palette reopened); (2) JITTER FIX: the film clock gates every frame on isPainted, so camera moves stop-start (recording: 1,089 unique of 3,672 frames, ~7.5 fps); camera must run on wall-clock, gate only at move starts and year steps; measure before/after; re-record '-smooth'. Jen is designing 2-3 'two loud, rest quiet' palettes with recoloured /map + film-ending sheets in scratchpad/palette/ (Lee picks; pick becomes a DECISIONS entry, amends ruling E). Waiting on Lee: yes/no to a Netlify DRAFT deploy of the spike for his phone (fallback basemap; MapTiler key is domain-locked). Before release: the hero's 5.8M (FTEN, since 1950) and the film's 10M (splice, since 1900) must come from the same merged measure. Videos and reports live in /tmp/claude-1000/-home-leesalo--local-share-marvin-worktrees-opencanopy-canopy/38525f5e-10fe-44aa-916f-99970f16ebe9/scratchpad (tmp; research/overpaint-2026-10-08 holds the durable copies).

- **/map defects found by the palette work (2026-10-11, Jen, recoloured-capture measurements, not yet re-verified):** (1) the z4-9 forest-age raster tiles overstate logging ~1.7x (49.5% of painted pixels harvested at z6 vs 28.6% at z9), so they need an area-true rebuild along with any new palette; (2) those tiles draw above every fire and cutblock shape, so fire is invisible at z<=9 in any palette (z-order); (3) the intro's hand-off jump is the film's own doing: land and old growth fade to black below z8.8 and forest age drops from 0.82 to 0.64 opacity when /map wakes. Jen's report cites palettes.json, checks.csv and film-recolour-report.json; none exist on disk, so her colour-blind pass/fail claims are unverified.

- **MapLibre 6 follow-through (shipped 2026-10-22 by session-d09d2c, main 120cc10):** (1) eyes owed on /map: data overlays at zoom, v6's deeper default overscale (queryRenderedFeatures popups), overlapping semi-transparent lines in registry.ts. (2) The intro spike branch (spike/intro-animation) is still on MapLibre 5: merge main into it, switch its maplibre imports to namespace form, and re-verify the dot canvas source, the offscreen warm-up map and the film clock's idle gates under v6 before any further draft. Ship note: ~/marvin/state/security-2026-10-22/opencanopy-shipped.md.

- `/save` is not a release path for OpenCanopy; it stops at the pre-push hook. (Until a marvin change teaches `/save` the release path.)

- Path to beta: the order is .claude/plans/audit-remediation-2026-10/beta-resequence.md (Lee's four answers 2026-10-23: film at beta, figure corrected now; calculator redesigned first; faster 4G; shared links fixed before beta). G0 status 2026-11-02: Phase 0 records, CI fix and the audit import are on main (4bd41f0); CI green once on main, three needed with one scheduled; P0b release tool built and reviewed (four batches, Razor PASS), shipping as its own release with the first install (Lee 2026-11-02 'Ship it'). Next: P0b's release sequence, then G1 (OPS, M1a, S0a). Still owed by Lee: the GPU driver reboot before SPEED (G2); keep or strike the two attribution notes on the 2026-10-23 bar and exit entries.

- **Film rethink (Lee, 2026-11-02), spike done, waiting on Lee's phone:** concept 'One tree, one clock' (research: ~/marvin/research/captivating-opencanopy-landing-film-bc-forests-20261102/report.md, scan, not verified). Spike branch spike/one-tree-one-clock (local only, d776a0a + e19797b), report ~/marvin/state/relay/one-tree-spike-report.md, draft https://6ae8045f62c3a41b15f731f5--merry-queijadas-27cd31.netlify.app/film-lab (re-checked 2026-11-02: clips serve; the /r2 proxy answers 206 on the PMTiles archive and 404 off-list, so tiles load on Netlify). Verdicts: the LiDAR orbit of Big Lonely Doug reads as a tree; the clip-to-live-map seam is pixel-exact in Chrome at capture size, edges soften via 4:2:0 chroma. Open: (1) clips 8.6 MB + 7.4 MB against the 2 MB pre-interaction bar (DECISIONS 2026-10-23), Lee's ruling owed after the phone check (shrink, tap-to-play, or loosen); (2) 4-6 s frozen last frame while the map idles: mount the map ~3 s before the clip ends; (3) the z<=9 raster opening overstates logging ~1.7x and has no tiles north of 55.8 N, not shippable before the area-true rebuild; (4) iPhone Safari BT.709 colour shift at the fade untested; (5) the 2019->2023 dissolve mixes growth with 2.6x pulse density, no growth caption until separated; LiDAR height 67.8 m vs registry 66.0 m unexplained, do not quote it. Next step: Lee opens the draft on his phone and reports colour at the fade, how the hold feels, the printed idle time, and whether the tree holds on a small screen. The approved beat sheet and the clock-waits-for-paint ruling are reopened only if he picks it. Harvest-volume table must enter the repo before any 'since 1989' line ships.

- **Lane S follow-up:** the landing story has the same readiness pattern (StoryMap.tsx:72, :152, its onLoad; lib/story/visibility.ts:48). ROADMAP Parking Lot, 'Deferred from datalayer-public-path'.

- **Lane S:** StoryMap never calls jumpTo today only because every chapter shares one camera; an un-docked dolly or a chapter with its own camera meets the readiness bug and, below react-map-gl 8.1.3, the transform throw. Resize on / throws on 8.1.0 (fixed by item 3).

- **M1a after items 3 and 4:** the URL-hash subscription defect stands (useMapState reads the map handle once, before the map exists); a shared deep link now completes its flyTo and can snap late after the visitor pans; batch-0 negative controls that relied on flyTo throwing must be re-baselined. audit:live: item 4 retargeted :187 to cutblocks, replaced :243 with a direct fish-streams proxy request and made every z11 test find the map before moving the camera (no test.skip left in live-health.spec.ts); M1a keeps :118 (stale URL parser) and :130 (raster z5).

- **PMTiles header timeout on slow devices (coordinator 2026-11-11: its own item after item 5; raises the parked 'no header retry' line):** PmtilesLayers gives the shared archive header 15 s from source registration and never retries (DataLayer.tsx, initSource timeout). Measured 2026-11-11 on production under host load 16: header held 10 s plus a saturated main thread (2-6 fps) tripped the timeout and the layer never attached. On a slow enough phone the same happens to every vector layer until reload. Evidence ~/marvin/state/relay/small-routed-fixes-live/candidate-visibility-run1-header-timeout-load16.json.

- **Lee's phone check, landing page (owed since 2026-11-11, release 8):** the hero now reads '5.7 million hectares' (was 5.8) and the logging chapter '5.7 million hectares' (was 'nearly 6 million'). Visual release; non-blocking.

- **Released 2026-11-10/11 (brief items 2-5), all green:** release 4 DataLayer public path (6af3b9d0), 5 react-map-gl 8.1.3 (6af3dd6f), 6 small routed fixes (6af3ee1d), 7 HEAVY (6af41ba4), 8 MEASURE (6af43423, main 45c2109). Ledger clean at token 8, known-good 6af43423. Release 8's post-release record and ROADMAP shipped entry ride in the next release's first commit (summary --unrecorded lists it). Primary ~/Projects/opencanopy main fast-forwarded to 45c2109.

- **Next (coordinator 2026-11-11):** the PMTiles slow-header fix (plan .claude/plans/2026-11-pmtiles-slow-header.md, in critic; build and release only if it stays small), then G1 per beta-resequence.md (OPS, M1a, S0a) in a fresh session after Lee is up.

## Open questions awaiting Lee

| Question | Why it matters | Raised |
|---|---|---|

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

### 2026-11-11: brief items 2-5 released; checkpoint

Releases 4-8 shipped green under Lee's standing yes (item 3 past the critic cap on his answer, relayed: "Yes to the yeses"). Found and fixed along the way: /map's vector layers, terrain and timeline year waited for the visitor's first touch (MapLibre 6 load fires only inside a render); the hero figure overstated (5,888,477 ha attribute sum vs 5,731,775 ha dissolved union, now 5.7 million). Live checks: scripts/live/live-checks.mjs (modes console, attach, visibility, year, interact, deeplink, story), each shown able to fail on the old deploy first. Removed from Owed as done: the wheel/drag throw (release 5), the stale primary checkout (fast-forwarded), the GPU driver mismatch (nvidia-smi reports driver 580.178.04 on 2026-11-10; recordings no longer software-rendered).

### 2026-11-11: release 7 (HEAVY) green; MEASURE releasing

Release record for the ledger (the release tool reads this full SHA here):
- sha=1dabd1eaff9129be274444619c87af30c5eec7d8 deploy=6af41ba4be5840b641e6bae3 data_version=none guards=green (HEAVY; evidence ~/marvin/state/relay/heavy-run-live/guard-evidence-token7.md)

MEASURE's union ran under heavy-run 08:33-09:05Z (load 4.69/6.76 at start, announced to the coordinator): every acceptance check passed, 5,731,775.10 ha by two independent methods, peak 1.59 GiB, 32 min. Before/after sent to the coordinator for Lee's board: hero 5.8M -> 5.7M.

### 2026-11-11: release 6 (small routed fixes) green; HEAVY releasing

Release record for the ledger (the release tool reads this full SHA here):
- sha=b5c0753478bf9209676c9d4a591b57aaaf9f934c deploy=6af3ee1dd9c6f6a7b06403d2 data_version=none guards=green (small routed fixes; evidence ~/marvin/state/relay/small-routed-fixes-live/guard-evidence-token6.md)

HEAVY merged (b7698a0) after three critic rounds and one Razor fix pass. MEASURE's plan passed its gate (d74b9f8); its union run waits on HEAVY being live.

### 2026-11-11: release 5 (react-map-gl 8.1.3) green; item 4 releasing

Release record for the ledger (the release tool reads this full SHA here):
- sha=11b72335d802b7277141b98125b3dda7bdbb3335 deploy=6af3dd6f661a76641ef15441 data_version=none guards=green (react-map-gl 8.1.3; released past the critic cap on Lee's 2026-11-11 answer, relayed: "Yes to the yeses"; evidence ~/marvin/state/relay/wheel-drag-live/guard-evidence-token5.md)

Item 4 merged (fac35c8) with a one-line follow-up found on its pre-push production run: the honest forest-age z11 test needed #layers=forest-age, because no layer is enabled on a fresh visit (7284df5).

### 2026-11-10: post-release records, releases 3 and 4

Release records for the ledger (sha, deploy, data version, guards; the release tool reads these full SHAs here):
- sha=9ad701babdb9bc97c71d28dfe65600607e7a60d6 deploy=6ae8b912eaff6cd3d1f02aab data_version=none guards=green (P0b release tooling)
- sha=4de59d712630cad7a1ebd0630d3c6516fd4b2a8a deploy=6af3b9d0647a97628cb3fffe data_version=none guards=green (DataLayer public-path relay; evidence ~/marvin/state/relay/datalayer-public-path-live/guard-evidence-token4.md)

Item 3 (react-map-gl 8.1.3) built, Razor PASS, waiting on Lee past the critic cap. Item 4 planned, critic r1 FAIL folded, round 2 running.

### 2026-11-10: DataLayer public-path relay built and reviewed; load readiness found live

Plan through two critic rounds (CONCERN, folded). While building the release's live checks, a headless probe of production showed MapLibre 6's `load` never fires on an untouched /map (70 s: no PMTiles source, no year, no terrain; one repaint fired it at once), because `load` fires only inside a render where loaded() is true. Folded as amendment A: readiness is style-parsed (`onStyleReady`), never `isStyleLoaded()` or `load`. Ted: two batches plus the amendment, 19 revert rows all red then green. Razor PASS, 20/20 requirements, nine mutants re-run. ROADMAP: P0b post-release record, current/next corrected, 25 old shipped entries archived (date + first sentence), Parking Lot section for seven deferrals. Next: the release sequence for this relay under Lee's standing yes.

### 2026-11-10: brief from marvin session-f1a7d3; P0b found already closed

Stand-in coordinator brief (state/briefs/opencanopy-2026-11-10.md in the marvin session worktree): six items, release each as it comes green. Item 1, P0b's bootstrap, was already done on 2026-11-02: ledger token 3 released green on deploy 6ae8b912 (main 9ad701b); installed tool byte-identical to origin/main; ~/marvin ignore patterns committed; core.hooksPath set; CI on main green on push 41481043557 and schedules 41540042323, 42720356767. ROADMAP `current`/`next` still describe P0b as unreleased; correct them in the next release's first commit, with P0b's post-release record. Lee's standing release yes recorded as a DECISIONS amendment on the Deploy entry (b7df0b4). Fable is blocked until 2026-11-12 03:00 Vancouver; creative reviser passes run on Opus meanwhile, said so. Saved at the coordinator's request before starting item 2 on fresh context.

### 2026-11-02: checkpoint before the P0b release

Wave one on main (4bd41f0, deploy 6ae7ecaeb4412e93460ae384): Phase 0 records, the 2 Oct rulings, the audit and calculator research imported, TRACEABILITY (59 serious open), the fidelity baseline (first real one; the suite had silently broken under MapLibre 6's pbf 5 and could fail open), CI split runtime from dev with lint first, four negative controls read on real CI. P0b release tool: plan through three critic rounds, Lee 2026-11-01 'Full, trimmed, with hook'; four batches, Razor PASS after fixes (C1, C2, W1-W4, R1-R3); 1,175 tests; ~250 mutants killed; ~/marvin ignore patterns committed by session-d09d2c (d1e5d873). Film: Lee stepped back; scan research ~/marvin/research/captivating-opencanopy-landing-film-bc-forests-20261102/report.md; Lee chose 'One tree, one clock' for a spike; draft /film-lab on 6ae8045f62c3a41b15f731f5 awaiting his phone. Live /map throws on wheel and drag under react-map-gl 8.1.0 with MapLibre 6.

Next: P0b release sequence and first install; then G1.

### 2026-11-02: wave one live, film rethink, spike draft

G0 partly done: primary back on main; Phase 0 records, CI fix on main at 4bd41f0 (deploy 6ae7ecaeb4412e93460ae384, rollback 6ada8fe82bdc8d8f12f11918); four CI negative controls read on real runs; first green on main, three needed with one scheduled. P0b: batches 1-2 reviewed, batch 3 in mutation tests, not installed. Fidelity baseline in research/beta-gate. Lee asked to step back on the film; scan research done; 'One tree, one clock' chosen for a spike.

### 2026-10-23: path-to-beta rulings recorded, program re-sequenced, Lee's four beta decisions

Relayed from marvin session-d09d2c (grill confirmed 2026-10-23). Six DECISIONS entries plus attribution notes; BETA.md; ROADMAP current/next refreshed (dated Sep 2 until now). beta-resequence.md amends glowing-dazzling-brooks.md: ten relays inserted (CI, OPS, NUM, MERGE, MAPFIX, T-pre, PIPE, SPEED, BETA, MATRIX), plus REBUILD, HIDE-K and VIEWSTATE; B′, C′, D′, E′, M3b and the rest of T deferred into the beta; W (watershed report card) and P (priority analysis) named as unplanned goal-(2) work. Critic: three rounds. Lee ruled: L = film, figure corrected now (amends the 2026-10-08 hold: the hero very likely floors at 5.7M against the shipped 5,888,477 ha once the cap and overlap fixes land); K = redesign first; S = faster 4G (against the Slow 4G recommendation); V = fix shared links before beta. CI is still red on dev-chain highs (brace-expansion, js-yaml, vite/launch-editor).

### 2026-10-22: main merged into marvin/canopy after the MapLibre 6 security ship

session-d09d2c fast-forwarded main 50ab18d -> 120cc10 (next 16.4.2, source-map-js, fflate; maplibre-gl 6.15.0 with setWorkerUrl; live deploy 6ada8fe82bdc8d8f12f11918, rollback 6acbff0931a9180009704260; Lee approved 2026-10-22). Merged here clean, npm ci, vitest 59 files / 867 passed. MapLibre 6 owed item replaced by the follow-through item (eyes on /map, spike branch port). The intro-lab draft (6acbff3cfb5a9c293751ff8d) was built on MapLibre 5 and is unaffected.

### 2026-10-11 -- Canopy palette picked; intro spike on a Netlify draft

Lee picked Canopy (DECISIONS 2026-10-11; tokens and checks in research/palette-2026-10-11/; Jen's checks reproduce: no failing pair, three marginal). The jitter fix landed (clock holds 38% -> 0% in beat 3, 19% -> 0% in the descent; films 89-92 s), but recordings here are software-rendered (NVIDIA driver/library mismatch, reboot needed), so Lee judges smoothness on his phone: draft deploy 6acbff3cfb5a9c293751ff8d, https://6acbff3cfb5a9c293751ff8d--merry-queijadas-27cd31.netlify.app/intro-lab (built from spike/intro-animation c6be621 with the MapTiler key blanked; production unchanged at 50ab18d, /intro-lab 404 there). The spike still draws the old palette; Canopy is not yet applied to it.

### 2026-10-07 -- All three docked ending versions rendered and sent to Lee

First renders ever of the docked ending work, sent to Lee for review before any new iteration. v1 (live scrub) recorded at phone and desktop on the build machine's GPU: 60 fps scroll, soft tiles mid-zoom. v2 (play-on-scroll video) rendered and encoded after two throwaway fixes: StoryMap's binary-reveal write drops when the style is not loaded and never retries (the video would have been blank), and the dev badge (still visible bottom-left). v3 (whole story as video) stopped at frame 551/634 on both tiers: the render spec treats the expected missing-ocean-tile 404s as fatal; the 23 s partials are in `/tmp/claude-1000/-home-leesalo--local-share-marvin-worktrees-opencanopy-canopy/38525f5e-10fe-44aa-916f-99970f16ebe9/scratchpad/renders/v3-out/`. encode-dolly.sh exits 141 (SIGPIPE) at the poster step after writing the videos. All three predate the 2026-09-02 data corrections. Throwaway worktrees under `/tmp/claude-1000/-home-leesalo--local-share-marvin-worktrees-opencanopy-canopy/38525f5e-10fe-44aa-916f-99970f16ebe9/scratchpad/renders/` stay until Lee has reviewed. Lee's verdict on the three is the open question before the intro spike iterates.

### 2026-10-07 -- email_click leak fixed live; Next 16.4

Pushed after Lee's yes. `16dc5e9`: email_click sends the recipient only (behavioural test red before, green after; live tracker.js verified), plus the plan, the 10-05 ruling and today's grill rulings now on main. `08659d5`: next 16.3.0 -> 16.4.0, sharp 0.35.5 with it; neither Next critical reached production (static export, images.unoptimized). Both deploys ready, /, /map, /privacy, /tracker.js 200. Rollback for either: republish 6aa4c2c6ff58fc000868e97f (3db5823). CI audit still red on MapLibre's critical and dev-only highs.

### 2026-10-07 -- Grill: program approved, phone checks cut to visual releases

Lee's two open questions of 2026-10-05 went through a grill (`.claude/grills/2026-10-07-remediation-approval-and-phone-qa.md`, confirmed). Facts that moved the answers: all eight critic rounds were FAIL, round 8 on one gating dimension only; the X2 leak is live on main (`tracker.js:165` sends the whole crash-report mailto, page URL included); Lee's phone check was already non-blocking in the plan, which is how seven checks piled up since July. Decided: program approved with round 8's fix folded, no round 9; one-line email_click hotfix today; Lee checks visual releases only (about 13 of 22), live guards gate the rest; owed checks never block, no cap (Lee overrode a three-owed pause); July backlog cut to two phone checks; at most three critic rounds per child plan, round one at the critic's highest effort (Lee: "be sure to deploy adequately high level plan critics to avoid repeated critics for things that could have been caught right away"). DECISIONS: the 2026-07-17 constraint amended, the critic cap added. The session worktree had forked from `dolly/phase2-video` again; reset onto `refresh/2026-09-01`, old tip tagged `keep/canopy-pre-reset-2026-10-07`.

### 2026-10-05 -- session-f8d7c3 closed for a context reset (saved by marvin session-d09d2c)

Lee closed every window to reset context. This session was in plan mode (no writes), so marvin session-d09d2c saved it: the plan and its eight critic reviews copied from ~/.claude/plans into .claude/plans/audit-remediation-2026-10/, Lee's two pending AskUserQuestion items recorded as open questions, and the branch's four unpushed commits (charter advocacy amendment 2026-09-11, FOM watch parked, four 2026-09-02 rulings, refresh ROADMAP/hand-off) pushed. The calculator findings noted on 2026-10-01 (frozen day-one prices, discarded per-polygon biomass, 4-14% of polygons dropped in drawn boxes) are in the calculator phase plan, per the session's own report.

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
