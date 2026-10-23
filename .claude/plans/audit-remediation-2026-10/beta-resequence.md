# Path to beta: the 2026-10 remediation program, re-sequenced

**Amends** `glowing-dazzling-brooks.md` (approved 2026-10-07): its **Lanes and waves** table and
the *order* in its **Dependency graph** are replaced by the order below. Relay specs, the program
contracts (C1-C7), the agents-and-models table, the critic contract and the release rules stand
unless a section here names a change. It is less a re-ordering than an insertion: Waves 1-3 keep
their internal order (M1a, M1b, M2, M3a; S0a, S0b, S1-lite, S1′), ten relays are inserted, and
four are deferred into the beta. Lee sees this order before G0 starts.

## Intent (grilled)

Grill: marvin session-d09d2c, `.claude/grills/2026-10-22-opencanopy-path-to-beta.md`, confirmed
2026-10-23 ("Yes, this is it"), relayed by that session. Rulings: DECISIONS, six entries dated
2026-10-23, with attribution notes.

**Anchor.** Lee: "dig into Open Canopy a little bit more and see if we can't create a cohesive
framework or definition of how we get ourselves to proper beta testing with it." And: "I guess I
would like to satisfy all of the primary goals before taking this into beta, whereby people will
poke around and inevitably find further issue."

**Lee's decisions.**
- Charter goals (1) and (3) before beta; goal (2) built during beta.
- An open public beta with a visible label (Lee overrode "invited group").
- Beta-day bar: no known serious bug, cosmetic ones on a public known-issues note; every public
  figure traced to a script and a test; map data in about 10 s on an ordinary phone on 4G; tiles
  rebuilt with current government data just before.
- A layer or feature that cannot meet the bar is hidden, not allowed to hold the beta.
- Exit: a quiet stretch with no open serious bug and no unverified number, and goal (2) shipped.
- Feedback through an in-map report form, no accounts.
- Tiles quarterly by Lee's one command after the pre-beta rebuild.
- Launch quiet; after a clean week, a note to a few conservation groups and a local journalist.

**MARVIN's calls in the grill, confirmed at its gate (Lee can change any without reopening the
rest).** The device list (current iPhone Safari, Android Chrome; desktop Chrome, Firefox,
Safari). Error monitoring and uptime alerting, free tiers, tool chosen by the session. Green CI,
lint running, the fidelity suite in CI or run per rebuild. "Serious" = breaks a feature, shows
wrong or missing data, or overstates. "A month" = four weeks from the label; a serious bug pauses
the clock, never resets it. Netlify Forms, optional email, named on /privacy. The label's form.
The vehicle is this program.

**Anti-goals (Lee's ranking).** A wrong number spreads. Testers hit bugs we already knew about.

**MARVIN's calls in this plan** are marked *(call)*.

## Where the program stands (2026-10-23)

- Phase 0 has not started; no Wave 1 child plan is written.
- Shipped outside the program: the `email_click` hotfix (16dc5e9), Next 16.4.2, MapLibre 6.15
  (main 120cc10, 2026-10-22).
- **CI is red** at `npm audit --audit-level=high`, so Lint never runs (`ci.yml:38-41`, run
  39866175520). The three high groups are all dev-chain: brace-expansion (via eslint and
  eslint-config-next, minimatch), js-yaml (via @eslint/eslintrc), vite (with the launch-editor
  advisories).
- `@mapbox/vector-tile` and `pbf`, which the fidelity suite's MVT reader imports, are still
  transitive under MapLibre 6 (`npm ls`: maplibre-gl 6.15.0 → @mapbox/vector-tile 3.0.0, pbf
  5.1.2), unpinned.
- `scripts/pipeline/rebuild.sh` is five vector phases into **one** archive, then manual steps
  (edit `PMTILES_URL`, run `deploy-tiles.sh`); no raster, no story products, no fidelity run.
- The X spike (`spike/intro-animation`) is on MapLibre 5, on a Netlify draft awaiting Lee's
  smoothness check.

## The bar, mapped to work

| Bar item | Cleared by | Gate condition |
|---|---|---|
| No known serious bug | M1a (R1-02, R1-05), M1b (R1-03), M2, M3a, MAPFIX, T-pre, S0a, S0b, S1-lite, L, K; MapLibre 6 follow-through (popups under v6's overscale, overlapping line opacity) in M1b | MATRIX sweep clean **and** TRACEABILITY's serious set closed: every item fixed with a guard or hidden with a test |
| Every public figure traced | NUM, with S0a, M2, S1-lite, MERGE/S1′ (if L = film), K.4 or HIDE-K | NUM's generated ledger complete; its gate check passes on the gate build after REBUILD |
| ~10 s to map data, 4G phone | SPEED (guard), M1b (raster visibility, terrain), T-pre (per-layer archives), S1′ weight budget or S2 story half (per L) | SPEED guard green on the gate build, on the profile Lee rules (decision S) |
| Tiles freshly rebuilt | PIPE, then REBUILD | fidelity suite **green** on the rebuild; a red layer is hidden (hide-don't-block) and listed |
| Monitoring, uptime | OPS | a test error (client and edge) and a test outage each reach Lee |
| Green CI | CI | three consecutive green runs on main, lint included |
| Feedback, known issues, label | BETA | a test report lands with place, zoom and layers; known-issues note published |

**TRACEABILITY's serious set** (Phase 0 builds it): the Oct 2 synthesis findings and the 09-20
program items already in its scope, **plus** the 08-22 visual audit's open findings, the
handoff's owed defects and the MapLibre 6 follow-through, each classified serious or cosmetic by
the definition above. Re-classified at each wave close.

## New relays

Each gets its own child plan, critic (three rounds max, round one at xhigh) and relay, written
just in time. Public copy in any of them (label note, known-issues page, form text) is shown to
Lee before merge, as story copy is.

- **CI (Simple, this session, G0; released with or right after P0's docs commit).** Clear the
  three dev-chain high groups by bumps, or by `--omit=dev` on the audit step with the dev chain
  tracked; the child plan picks and says why. Lint runs. Pin `@mapbox/vector-tile` and `pbf` as
  direct dev deps (the install needs Lee's terminal). Run `npm run audit:ci` once on v10 as a
  baseline and record the result; if it is red, the failing audits are classified into
  TRACEABILITY and owned before REBUILD. Done when main is green three runs running.
- **OPS (Simple, this session, G1).** Client and edge error capture; uptime monitors on `/`,
  `/map`, the WFS proxy and one PMTiles range request; free tiers. *(call)* UptimeRobot for uptime;
  the error tool chosen in the child plan under C6: page URL, request URL and breadcrumbs scrubbed
  to origin + path, default PII capture off, no IP retention, no replay; C6's sentinel-coordinate
  payload test extended to one captured client error and one edge error. "A test outage reaches
  Lee" means a monitor on a deliberately failing URL, or the tool's test notification; production
  is never taken down to prove it. Sampling or rate limits,
  and an alert at 80% of the free quota, so one bug on every load cannot drain it into silence.
  /privacy names the tool. Probe the free-tier limits before the plan.
- **NUM (Standard, Lane S with a Lane M batch, G2 to the gate).** The figure set: static public
  copy and aggregates (landing, hero, film captions if L = film, calculator outputs, share card,
  Discover panel, legend notes, the /map timeline's cumulative readout and per-year histogram,
  the FOM open-comment count, the cited 0.1% / 35,000 ha). Per kind, "traced" means: an
  aggregate has a derivation script and a test pinning its value, floored; a cited figure has a
  visible source link and a test pinning the string to the source value; a live figure (the FOM
  count) follows C4; per-feature popup attributes are raw data, traced by a field-mapping test, as
  in the 09-02 refresh. The ledger is **generated** from those tests (each registers its figure),
  never hand-kept. The gate check reads the copy sources (`chapters.ts`, the hero, `CtaSection`,
  legend notes, share meta, the film captions, the beta note, the known-issues page) and fails on
  any numeral token, years and dates excluded by pattern, that the ledger does not register. "Larger than Nova Scotia" is sourced or cut.
- **MERGE (Standard, Lane S, only if L = film).** The inventory + FTEN splice for 1900-2025, so
  the hero and the film carry one measure. Defects (1) and (2) of 2026-10-08 are **not** MERGE's:
  they go to S1-lite (below). Defect (3), versioned immutable `/raster`, stays with S2-pages (C1).
- **MAPFIX (Standard, Lane M, after M1b; pulled forward from C′).** The z4-9 forest-age raster
  overstates logging about 1.7x (area-true rebuild) and draws above fire, hiding it at z9 and
  below (z-order). The Canopy palette is applied in the same rebuild, because the 2026-10-11
  ruling ties it there; the trade is a Jen spec, a Stage 3 review and a phone look on a
  bar-critical relay. Re-verify both defects live first; they are recoloured-capture
  measurements. Release under C1 (versioned raster path).
- **T-pre (Complex, Lane M, after M1b; pulled forward from T).** All four build-side items of the
  08-22 P3 fix in one build: per-layer archives (today one archive carries all 12 vector layers in
  every tile; median 26.5 MB per z7 view, `research/map-visual-audit-2026-08-22.md` P3), forest-age
  vectors from z10 only, non-public layers out, and the tippecanoe flags that close the z10+ holes.
  Plus the reader switch (renderer keyed by tile URL) in a deploy of its own with old-link
  fixtures, per C1. Touches no `netlify.toml` or headers (if it must, it releases after S2-pages).
  The rest of T (E&N mask, big-tree subset, empty-tile manifest) stays in the beta.
- **PIPE (Complex, G5; build after MAPFIX, T-pre, S1-lite, and MERGE + S1′ or S2 story half per
  L).** Its first batch packages pipelines other relays built; the new work is the single
  command, the record and the runbook. The story-product scripts (`build-scrub-tables.py`,
  `build-year-overlays.py`, the dots builder) and `scripts/pipeline/*` join C2's conflict matrix,
  so PIPE never edits them while a Lane S relay does. It never touches `COARSE_OVERLAYS_SUNSET`
  (S0b's constant, written once), and story assets are versioned per C1 with two prior versions
  retained. `rebuild.sh` becomes one command from one
  government pull to versioned artifacts: per-layer vector archives (T-pre's layout), the
  area-true raster (MAPFIX's method), **and the story products** (scrub tables, overlay frames or
  dots, totals) so the story and the map always share a vintage, as the "story and map alike"
  ruling requires. Then the fidelity suite, a result file recording layer count and archive sizes
  against the previous version (fails on a drop), the C1 version constant, and a runbook
  (`docs/REBUILD.md`) for Lee's quarterly run. MAPFIX and T-pre prove their changes on current
  data; PIPE packages them; REBUILD re-runs the package on fresh data. Three builds, not four.
  Does not touch CHARTER.md (the wording is with Lee via session-d09d2c).
- **SPEED (Simple, Lane M, after M1a).** A throttled guard: cold `/map` and a cold deep link, cache
  disabled, first data layer painted (probe count > 0 and layer pixels) within 10 s, on the profile
  Lee rules (decision S). The guard records the WebGL renderer string and refuses to report on
  llvmpipe or SwiftShader; the build machine's GPU needs the driver fix (a reboot, owed by Lee
  before SPEED) or the guard runs on another host. **This amends M1a's rule** that throttled timings are measurements, never
  acceptance: for beta, this one budget is acceptance, by Lee's speed bar.
- **BETA (Standard, Lane M, after M3a).** The tag and its one-line note; the known-issues page;
  the in-map report form on Netlify Forms capturing place, zoom and visible layers, saying on the
  form that the view is sent, optional email, a honeypot field; the bug-report button opens the
  form, and **the mailto stays as the fallback link on the form and on /privacy** (DECISIONS
  2026-10-23). /privacy names the form, where submissions are held (Netlify, under Lee's account)
  and how long they are kept after triage. Probe first: Netlify Forms with `output: "export"`, the
  plan's submission cap and what happens past it. Also pulled in from M3b: C6's two-decimal
  rounding of geolocated coordinates written to the hash (one call), so no public launch carries
  exact locations in shared links.
- **MATRIX (gate sweep, this session).** Headless Playwright on Chromium, Firefox and WebKit, phone
  and desktop viewports, over a fixed route list (`/`, `/map` cold, deep links, search, share,
  every public layer at z5, z9, z12, the calculator or its absence and every route to it, /privacy,
  the form). Folds in the owed agent checks (a11y P2 cluster, audit P0+P1). Then Lee's phone look
  on iPhone Safari and Android Chrome, with his two owed checks. His checks never block a release
  (DECISIONS); at the gate, a serious bug he finds is by definition known, so it is fixed or hidden
  before the label.
- **REBUILD (Lee's terminal, at the gate).** PIPE's command on fresh data, under the 2026-10-23
  ruling (by Lee, one command) and because the R2 upload needs his yes. Released under C1.
  Acceptance: the fidelity suite green **and** C5's story truth checks green on the rebuilt story
  products. NUM and MATRIX run after it, on the gate build.
- **The hide floor.** Hide-don't-block applies to secondary layers and features. Forest age (the
  film's hand-off target by the 2026-10-08 ruling), cutblocks, fire and old-growth-250 carry the
  story and cannot be hidden. If one is red at REBUILD, its previous version stays live under C1
  with its vintage shown, and the label waits on Lee's call, brought to him in the seven-part
  shape.
- **HIDE-K (Simple, Lane M plus one Lane S copy touch, G5, before BETA; only if K = hide).** Every
  route to the calculator goes: the CO2 panel in the layer sheet, the PDF route, the landing and
  nav references, old share links that open it (they land on the map without it). Tested on the
  URL paths. Co-owns Review Focus 3.

**S1-lite, scope added:** measure-merge defects (1) and (2) of 2026-10-08 go into its area
contract unconditionally: the 2,000 ha cap on max(attribute, geometry), which today lets nine
polygons (82,920 ha) through and puts 1991-2003 up to 15% high, and overlap dissolved before
summing (+1.7% in 2025). They overstate, so they are serious whatever L is.

**That collides with the 2026-10-08 measure ruling, and Lee decides it (inside decision L).** The
ruling says the merge is "built and reconciled before any public number changes. Until then the
public figure stays 5.8 million ha (FTEN)." The shipped total is 5,888,477 ha
(`cutblocks-scrub.json`); the cap correction alone takes it to about 5,805,557, and the overlap
correction (about 1.7%) very likely takes the floored figure to 5.7 million. Under L = film,
MERGE is in the gate and the hero changes once, to the merged measure. Under L = scroll story,
either MERGE runs anyway (one change, to the merged figure) or the ruling is amended to allow a
downward correction first. The 2026-09-02 ruling ("when in doubt, understate") favours letting
a figure fall; holding an overstated 5.8M through beta day is not available under the bar.

**Phase 0.2, record list reconciled.** Before writing, reconcile against the entries written since
Phase 0 was specified (2026-10-08 film, amended twice; 10-09 dots; 10-11 Canopy; 10-23 beta).
Ruling E is not recorded (Canopy replaced it). X1-X3 are recorded as the film entry already
states them. **Ruling D is recorded bounded:** the dollar bar stays "until the redesign ships or
the beta label goes up, whichever is first" (decision K settles which).

## Built during the beta

- **Goal (2):** B′, the accountability view (Phase B rebase plus tenure attribution, Ruling H).
  **The watershed report card and the conservation priority analysis have no plan anywhere in the
  program;** they become **W** and **P**, each with a grill and a plan, during the beta. The beta
  cannot exit until all three ship.
- C′ (the rest of the Phase C re-spine), D′ (FOM layer), E′ (E2-E5), the rest of T.
- **M3b**, less the coordinate rounding (now in BETA) and, if Lee says so, the shared view-state
  parser (decision V).
- The calculator if K = hide; the film if L = scroll story.

Each is indexed in the ROADMAP Parking Lot when this plan is approved.

## The order

Lanes as before: Lane M (map), Lane S (story and pages), and this session (orchestrator, ops,
calculator design). Releases stay serialized under C2; C7's heavy-build lock covers G4-G5, where
both lanes build heavy.

| Wave | This session | Lane M | Lane S |
|---|---|---|---|
| G0 | Phase 0 (records reconciled; TRACEABILITY with the serious set), **CI**, P0b | — | — |
| G1 | **OPS** | M1a (probe release, then core) | S0a (copy, privacy) |
| G2 | **NUM** figure set and test registry started | M1b (+ MapLibre 6 follow-through); **SPEED** guard | S0b (dated-only overlays) |
| G3 | K.2 grill, K.3 design (if K = build) | M2; **MAPFIX** | S1-lite (+ defects 1, 2); X closes on Lee's verdict |
| G4 | — | M3a; **T-pre** | **MERGE** then S1′ (if L = film), or S2 story half (if L = scroll story); S2-pages |
| G5 | **PIPE**; K.4 (if K = build; after M3a) | **HIDE-K** (if K = hide); **BETA** | HIDE-K's copy touch |
| Gate | **REBUILD** (Lee); NUM check; **MATRIX**; Lee's phone look; known-issues note | — | — |
| Beta | report triage; exit clock | B′, W, P; C′, D′, E′, rest of T, M3b | film or calculator if deferred |

**Critical path per branch.** No relay here has been sized yet, so no calendar duration is
claimed; the child plans size them. What the graph does say:
- Lane M is the spine on every branch: M1a → M1b → (MAPFIX, T-pre) → PIPE → REBUILD, with M2 →
  M3a → BETA beside it.
- **K = build lengthens it**: K.4 cannot start until M3a releases, so the calculator relays run in
  series after the map spine's middle.
- **L = film runs in parallel** in Lane S (S0a → S0b → S1-lite → MERGE → S1′) and lengthens the
  road only if S1′ (Complex) outlasts Lane M's remaining chain, or if the spike fails Lee's check.
- **The shortest road** is L = scroll story, K = hide: no S1′, no K.4; S2 story half (Standard)
  and HIDE-K (Simple) in their place, MERGE only if Lee wants one change to the hero.
- Tier chains: the map spine is Standard, Standard, Standard + Complex, Complex, then Lee's
  REBUILD. L = film adds Standard (MERGE) and Complex (S1′) in Lane S. K = build adds a grill, a
  design plan and K.4's relays (at least one Complex, with the edge function under Razor) after
  M3a.
- M3a stays whole in the gate, chrome included, because BETA needs its bug button in the layer
  sheet and K.4 its single panel slot; splitting the status machine from the chrome would cost a
  second relay over the same files.

### Dependency graph (additions and changes)

The original rows stand except as changed here.

| ID | Build after | Release after (plus C2) |
|---|---|---|
| CI | — | with or right after P0 |
| OPS | P0b | CI |
| NUM | S0a | its gate check runs after REBUILD |
| SPEED | M1a | M1b |
| MAPFIX | M1b | M2 (C1 versioned raster) |
| T-pre | M1b | MAPFIX (C1 versioned; reader switch its own deploy) |
| PIPE | MAPFIX, T-pre, S1-lite; MERGE + S1′ or S2 story half per L | — (tooling; first real run is REBUILD) |
| HIDE-K | K = hide, M3a | M3a; before BETA |
| MERGE | S1-lite (L = film) | S1-lite |
| S1′ | X verdict = pass, MERGE | MERGE |
| S2 story half | L = scroll story, or X verdict = fail | S1-lite |
| K.4 | K.3, M3a released | **M3a** (was M3b) |
| BETA | M3a | M3a, OPS |
| REBUILD | PIPE | every G-wave release green |
| MATRIX | REBUILD released | — |
| Beta label | MATRIX clean, Lee's look, NUM check, TRACEABILITY serious set closed, CI green, OPS live, SPEED green | — |
| B′ | label up | M3a, S1-lite (Ruling A unchanged) |
| M3b | label up | — |

**If the spike fails Lee's smoothness check under L = film,** L reverts to scroll story: S2 story
half enters the gate in G4, MERGE and S1′ move into the beta.

## Four decisions for Lee

Brought to him in conversation in the seven-part shape. **S is needed before SPEED's child plan
(G2); L, K and V before G3.** G0 and G1 can start on his look at this order. The outcomes are
recorded here and in DECISIONS, together with his nod or strike on the two attribution notes
added to the 2026-10-23 entries (written by this session on the critic's finding).

- **L. The landing at beta: the film, or the corrected scroll story?** His 2026-10-08 ruling is
  that the landing *is* the film; scroll story at beta means opening on a page he has ruled is to
  be replaced, and its speed work (S2 story half) is thrown away when the film lands. The
  program's weight budgets differ: under 2 MB before interaction for the film, under 5 MB for the
  scroll fallback, against 17.6 MB today. L also settles the hero figure (S1-lite section above).
- **K. The calculator at beta: redesigned, or hidden?** The teardown (every constant unsourced,
  67% of area on a default species, a corner clip dropping 4-14% of polygons) means no small patch
  meets the number bar. Hidden means every route to it goes: the landing and nav references, the
  CO2 panel in the layer sheet, the PDF route, old share links. Either way ruling D ends at the gate.
- **S. Which 4G?** The program's own milestone is "within 10 s on Slow 4G". Lighthouse's mobile
  profile is nominally 150 ms round trip, about 1.6 Mbps down, 750 kbps up, 4x CPU; applied
  through Chrome's network emulation it becomes about 562.5 ms round trip and about 1.47 Mbps
  down, which at a 10 s bar can decide pass or fail. Chrome's faster 4G preset is easier. Put to
  Lee with the applied numbers; SPEED's plan states the raw values it passes. And on the landing, does the bar mean the first frame of map data the reader is shown
  *(call, read back to him)*, not the hero photo?
- **V. Shared links that drop the year and the class filters:** fix before beta (pull M3b's
  view-state parser into the gate), or list it as known? A journalist's shared link is the
  outreach path.

## Pre-mortem

1. **The gate never arrives.** K, the film, T-pre and goal (2)'s unplanned W and P stack up.
   Guard: L and K are named before G3; hide-don't-block at every wave; the orchestrator reports
   the critical path at each wave close.
2. **The story and the map disagree on beta day.** REBUILD refreshes the tiles but not the hero.
   Guard: PIPE rebuilds the story products from the same pull; NUM checks after REBUILD.
3. **The form goes quiet and quiet reads as clean.** Spam fills the free cap. Guard: the honeypot,
   the cap probe, and OPS's uptime check extended to a weekly test submission.

## Load-bearing assumptions

- The fidelity suite runs on v10. Unverified; CI's baseline run resolves it in G0.
- The CI fix has no runtime change. All three high groups are dev-chain (verified); residual
  risk is a vite bump breaking vitest.
- Netlify Forms works with this static export and its cap suffices. BETA's probe resolves both.
- A free error tool meets C6. If none does, OPS falls back to an edge-logged error beacon.
- MAPFIX's defects reproduce live; if not, MAPFIX shrinks to the palette.

## Inversion

The approved order (Waves 1-6, then beta) wins only if goal (2) were a precondition, which Lee
ruled it is not; it would keep B′, C′, D′ and E′ ahead of the monitoring, CI, feedback and speed
work the beta needs. The minimal gate (scroll story, calculator hidden, per-layer archives only
if SPEED stays red after M1b) is the shortest road; it is on the table through L and K, and per-
layer archives stay in because the same build closes the z10+ holes, which are missing data.

## Review Focus

1. A figure added after NUM's inventory reaches the gate build. Owner: NUM's gate check.
2. The speed guard passes on a warm cache or software rendering. Owner: SPEED.
3. A hidden layer or calculator is still reachable by deep link, preset or old share link. Owner:
   BETA (hide means unreachable, tested on the URL paths) and HIDE-K.
4. A report from the form loses its place or layers on a phone. Owner: BETA.
5. The rebuild's fidelity result is green on a partial build. Owner: PIPE.

## Durable state

- The exit clock (label date, pauses, resumes, the four-week date) and the known-issues list:
  `research/beta-gate/clock.md` (dates and issue titles only, never reporter data) and the public
  known-issues page, both written by the project session; the coordinator's daily pass reads the
  form submissions when no project session is live. OPS's weekly test submission is tagged so
  triage drops it.
- Files this amendment touches: this file; the blockquote in `glowing-dazzling-brooks.md`;
  `BETA.md`; ROADMAP `current`/`next` and, on approval, the Parking Lot; handoff owed items;
  DECISIONS (the 2026-10-23 entries; D and the four decisions as they land).

## Revision log

**2026-10-23, written.** Re-sequenced from the path-to-beta grill.

**2026-10-23, Fable critic r1 (xhigh): FAIL** (`beta-resequence-critic.md`, 2 FAIL, 13 CONCERN).
Codex weekly window at 100%, so the critic ran on Fable (fallback). Folded:
1. Graph: K.4 releases after M3a; S2 story half placed; the film fallback stated; T-pre's header
   edge disclaimed; MAPFIX and T-pre marked C1.
2. Defects (1) and (2) moved to S1-lite unconditionally.
3. PIPE rebuilds the story products too; NUM checks after REBUILD.
4. PIPE after MAPFIX and T-pre, Complex; T-pre takes all four P3 items and the reader switch.
5. The mailto stays as fallback; the four grill calls re-attributed (here and in DECISIONS); the
   REBUILD reason corrected; Phase 0.2 reconciled with D bounded; coordinate rounding into BETA.
6. NUM: figure set, "traced" per kind, generated ledger, a static-copy check.
7. CI: all three high groups; the vector-tile/pbf pin; the `audit:ci` baseline; red fidelity hides.
8. SPEED: profile made decision S; renderer check.
9. BETA/OPS: cap, honeypot, retention, quota alert, request scrub with sentinel test; durable
   clock.
10. Parking Lot on approval; file list; the bug split; the CI wording; M3b's parser as decision V.

**2026-10-23, Fable critic r2: CONCERN, no gating FAIL** (0 FAIL, 7 CONCERN). Both r1 rejections
upheld. Folded: PIPE's story edges, G5, conflict matrix, sunset constant, C1 story versions;
REBUILD runs the story truth checks; the hide floor; HIDE-K; decision timing (S before G2); the
10-08 measure collision made explicit inside L (S1-lite's corrections very likely floor the hero
at 5.7M); the attribution notes go to Lee; definitions (test outage, NUM sources and tokens, S's
applied numbers); residuals (M3a reason, weight budgets, tier chains, GPU reboot owed, clock holds
no reporter data, tagged test submission, known-issues writer).

Rejected in part (round 1):
- **Durations per wave.** No relay is sized, and a guessed calendar would be invented data. The
  critical path is stated per branch instead.
- **"MapLibre 6 no longer carries the MVT packages."** `npm ls` shows it still does (verified).
  The pin is kept as hygiene, with no urgency claimed.
