# Path to beta: the 2026-10 remediation program, re-sequenced

**Amends** `glowing-dazzling-brooks.md` (approved 2026-10-07): its **Lanes and waves** table and
the *order* in its **Dependency graph** are replaced by the order below. Relay specs, the program
contracts (C1-C7), the agents-and-models table, the critic contract and the release rules stand
unless a section here names a change. Nothing here is built until Lee has seen this order.

## Intent (grilled)

Grill: marvin session-d09d2c, `.claude/grills/2026-10-22-opencanopy-path-to-beta.md`, confirmed
2026-10-23 ("Yes, this is it"). Relayed by that session; the rulings are in DECISIONS (2026-10-23,
six entries).

**Anchor.** Lee: "dig into Open Canopy a little bit more and see if we can't create a cohesive
framework or definition of how we get ourselves to proper beta testing with it." And: "I guess I
would like to satisfy all of the primary goals before taking this into beta, whereby people will
poke around and inevitably find further issue."

**Lee's decisions (summary).**
- Charter goals (1) and (3) before beta; goal (2) is built during beta.
- An open public beta at opencanopy.ca with a visible beta label (Lee overrode "invited group").
- Beta-day bar: zero known serious bugs on current iPhone Safari, Android Chrome, desktop Chrome,
  Firefox, Safari; every public figure traced to a script and a test; about 10 s to first map data
  on an ordinary phone on 4G; tiles freshly rebuilt; error monitoring and uptime alerting; green CI.
- A layer or feature that cannot meet the bar in time is hidden, not allowed to hold the beta.
- Exit: four weeks with no open serious bug and no unverified number (a serious bug pauses the
  clock), and goal (2) shipped.
- Feedback through an in-map report form; cosmetic issues on a public known-issues note.
- Tiles rebuilt right before beta, then quarterly by Lee's one command.
- Launch quiet; after a clean week, a note to a few conservation groups and a local journalist.

**Anti-goals (Lee's ranking).** A wrong number spreads. Testers hit bugs we already knew about.

**MARVIN's calls in the grill (not Lee's; open to his correction).** "Serious" = breaks a
feature, shows wrong or missing data, or overstates. The vehicle is this program, re-sequenced.
Monitoring on free tiers, tool chosen by the session. Netlify Forms for the report form. The
device list. Pause-not-reset. The label's form.

**MARVIN's calls in this plan** are marked *(call)* where they appear.

## Where the program stands today (2026-10-23)

- Phase 0 has not started. No Wave 1 child plan is written.
- Shipped outside the program: the `email_click` hotfix (16dc5e9), Next 16.4.2, and MapLibre 6.15
  (main 120cc10, 2026-10-22).
- **CI is still red.** The MapLibre 6 ship did not clear it: `npm audit --audit-level=high` now
  fails on dev-only highs (vite 8.0.0-8.1.5, launch-editor; 3 high, 4 moderate), so Lint never
  runs (`ci.yml:38-41`; run 39866175520).
- The X spike (`spike/intro-animation`) is on MapLibre 5 and awaiting Lee's smoothness check on a
  Netlify draft.

## The bar, mapped to work

| Bar item | Cleared by | What the gate checks |
|---|---|---|
| No known serious bug: core map | M1a, M1b (with the three DataLayer public-path bugs), M2, M3a, MAPFIX, T-pre | MATRIX sweep clean; M1a/M3a live guards green |
| No known serious bug: landing | S0a, S0b, S1-lite, then the landing decision (L) | MATRIX sweep; S0/S1-lite truth checks |
| No known serious bug: calculator | the calculator decision (K) | K.4 guards, or the calculator hidden |
| Every public figure traced | NUM, with S0a (copy), M2 (share card, Discover 1,131 ha, popups), MERGE (if L = film), K | NUM ledger: every figure on the landing, calculator and popups has a script, a test and a value match on the live build |
| ~10 s to first map data, 4G phone | SPEED (guard), M1b (raster visibility, terrain), T-pre (per-layer archives), S1′ weight budget (if L = film) | SPEED guard green on the gate build |
| Tiles freshly rebuilt | PIPE (one command), then REBUILD (Lee runs it) | fidelity suite result recorded for the rebuild |
| Error monitoring, uptime alerting | OPS | a test error and a test outage each reach Lee |
| Green CI | CI | three consecutive green runs on main, lint included |
| Feedback, known issues, beta label | BETA | a test report lands in the triage list with place, zoom, layers |

## New relays (gaps the approved program did not cover)

Each gets its own child plan, critic (three rounds max, round one at xhigh) and relay, written
just in time like every other relay.

- **CI (Simple, this session, first).** Clear the dev-only highs (vite and launch-editor bumps,
  or `--omit=dev` on the audit step with the dev chain tracked; the child plan picks and states
  why); lint runs; the fidelity suite (`scripts/audit-*.ts`, `audit-all.ts`) either joins CI or runs
  inside PIPE with its result written to a dated file. Done when main is green three runs running.
- **OPS (Simple, this session, early).** Error capture for client-side exceptions and edge-function
  failures, and uptime monitors on `/`, `/map`, the WFS proxy and one PMTiles range request.
  Free tiers. *(call)* UptimeRobot for uptime (already connected); the error tool is chosen in
  the child plan against the privacy rule: no IP retention, no session replay, URL scrubbed to
  origin + path as C6 does for the tracker. /privacy names both. Probe the tool's free-tier limits
  before writing the plan. Early because every later relay benefits from seeing its errors.
- **NUM (Standard, Lane S with a Lane M batch).** A ledger, `research/beta-gate/numbers.md`, of
  every figure the public sees: landing copy, hero, film captions (if L = film), calculator
  outputs, popups, share card, Discover panel, legend notes. Per figure: the string, where it
  shows, the script that derives it, the test that pins it, floored per the 2026-09-02 ruling, or
  "cited" with a visible source link. Figures with no derivation are cut or sourced; "larger than
  Nova Scotia" is the known open one. The ledger is checked against the live build at the gate.
- **MERGE (Standard, Lane S; only if L = film).** The inventory + FTEN measure merge, with the
  three defects found 2026-10-08: the cap on max(attribute, geometry), overlap de-duplication, and
  versioned immutable `/raster` paths (the third already belongs to S2-pages, C1). Required
  because the hero (5.8M since 1950) and the film (10M since 1900) cannot both stand on one page.
  The 2026-10-08 "Logged hectares means..." amendment already holds the public figure at 5.8M
  until this merge.
- **MAPFIX (Standard, Lane M, after M1b; pulled forward from C′ and T).** The two /map defects
  the palette work found (2026-10-11): the z4-9 forest-age raster overstates logging about 1.7x
  (area-true rebuild) and draws above fire, so fire is invisible at z9 and below (z-order). The
  Canopy palette (DECISIONS 2026-10-11) is applied in the same rebuild, since the ruling says
  applying it needs that rebuild. Re-verify both defects on the live build before the plan is
  written: they are recoloured-capture measurements, not yet confirmed.
- **T-pre (Complex, Lane M; pulled forward from T).** Per-layer PMTiles archives in place of the
  single archive that carries all 12 vector layers in every tile (median 26.5 MB per z7 view;
  `research/map-visual-audit-2026-08-22.md` P3), and the tippecanoe flag change that closes the z10+ straight-line holes
  (missing data). Release under C1 (versioned path, old version kept). The rest of T stays in beta.
- **PIPE (Standard).** `rebuild.sh` becomes one command from government sources to versioned
  tiles on R2, with the fidelity suite run and its result written. Run on Lee's machine (the
  sandbox cannot render tiles; DECISIONS). The charter wording for this is with Lee via
  session-d09d2c; this relay does not touch CHARTER.md.
- **SPEED (Simple, Lane M).** A throttled guard: cold `/map` and a cold deep link on a pinned
  mid-range-phone CPU and 4G network profile, first data layer painted (probe count > 0 and
  layer pixels) within 10 s. **This amends the M1a rule** "throttled-profile timings are recorded
  as measurements, never acceptance": for beta, this one throttled budget is acceptance, by Lee's
  speed bar. The profile is pinned in the child plan; the audit's Slow 4G figure (37-42 s) is
  recorded beside it for comparison. *(call)* On the landing, the bar applies to the first frame
  of map data the reader is shown, not to the hero photo.
- **BETA (Standard, Lane M, after M3a).** The beta tag and its one-line note; the known-issues page;
  the in-map report form on Netlify Forms capturing place, zoom and visible layers, optional
  email; /privacy names the form; the form registered in the static export so Netlify detects it
  (probe this first: `output: "export"` with Netlify Forms). M3a already moves the bug-report
  button into the layer sheet, so BETA follows M3a and replaces that button's mailto.
- **MATRIX (gate sweep, this session).** Headless Playwright on Chromium, Firefox and WebKit, phone
  and desktop viewports, over a fixed route list (`/`, `/map` cold, deep links, search, share,
  every public layer at z5, z9, z12, the calculator or its absence, /privacy, the report form).
  Folds in the owed agent checks (a11y P2 cluster, audit P0+P1). Then Lee's phone look on iPhone
  Safari and Android Chrome, plus his two owed phone checks. Per DECISIONS his checks never block
  a release; at the gate, a serious bug he finds is by definition known, so it is fixed or hidden
  before the label goes up.
- **REBUILD (Lee's terminal, at the gate).** The fresh rebuild with PIPE's command, its fidelity
  result recorded, released under C1 like any data change.

## Moved out of the gate: built during the beta

- **Goal (2):** B′ (the accountability view: Phase B rebase plus tenure attribution, Ruling H).
  **Two of goal (2)'s three items have no plan anywhere in the program:** the watershed report
  card and the conservation priority analysis. They become **W** and **P**, each needing a grill
  and a plan, during beta. The beta cannot exit until all three ship.
- C′ (the rest of the Phase C re-spine), D′ (FOM layer), E′ (E2-E5), the rest of T.
- **M3b** *(call)*: timeline chrome, search clear of zoom, inactive-chip contrast, the shared view-state
  parser, geolocate cap, phone polish. All cosmetic under the "serious" definition except shared
  links dropping the year and class filters; that one is listed on known-issues. If Lee counts a
  shared link that loses its year as broken, M3b moves back into the gate.
- The calculator, if K = hide. The film, if L = scroll story.

## The order

Lanes as before: Lane M (map), Lane S (story and pages), and this session (orchestrator, ops,
calculator design). Each wave's relays may run in parallel across lanes; releases stay serialized
under C2.

| Wave | This session | Lane M | Lane S |
|---|---|---|---|
| G0 | Phase 0 (records, audit import, TRACEABILITY now also mapping every bar item), **CI**, P0b | — | — |
| G1 | **OPS** | M1a (probe release, then core) | S0a (copy, privacy) |
| G2 | **NUM** ledger drafted (inventory only) | M1b + the three DataLayer bugs | S0b (dated-only overlays) |
| G3 | K.2 grill, K.3 design (if K = build) | M2 | S1-lite; X spike closes on Lee's verdict |
| G4 | **PIPE**; **SPEED** guard | M3a; then **MAPFIX** | **MERGE**, then S1′ film (if L = film); S2-pages |
| G5 | K.4 (if K = build; after M3a, shared panel slot) | **T-pre**; **BETA** | NUM closes: every figure traced |
| Gate | **REBUILD** (Lee), **MATRIX**, Lee's phone look, known-issues note written | — | — |
| Beta | triage of reports; exit clock | B′, W, P (goal 2); C′, D′, E′, rest of T, M3b | film or calculator if deferred |

### Dependency graph (additions and changes)

The original graph's rows stand except as changed here. Build edges first, then release edges.

| ID | Build after | Release after (plus C2) |
|---|---|---|
| CI | — | — (docs and config only; first release) |
| OPS | P0b | CI |
| NUM (ledger) | S0a | closes after S0b, M2, S1-lite, MERGE/S1′, K.4 or hide |
| MERGE | S1-lite | S1-lite |
| S1′ | X verdict, MERGE | MERGE |
| MAPFIX | M1b | M2 |
| PIPE | P0b | — (tooling; its first real run is REBUILD) |
| T-pre | M1b, PIPE | MAPFIX (both change raster or vector data; C1 versioned) |
| SPEED | M1a | M1b (the guard needs M1a's probe) |
| BETA | M3a | M3a, OPS |
| REBUILD | PIPE, T-pre, MAPFIX | all G-wave releases green |
| MATRIX | REBUILD released | — |
| Beta label | MATRIX clean, Lee's look, NUM closed, CI green, OPS live, SPEED green | — |
| B′ | label up (was M3b) | M3a, S1-lite (Ruling A unchanged) |
| M3b | label up | — |

## Two decisions for Lee before any build

Both change the length of the road to beta. They are brought to him in conversation in the
seven-part shape; this file records the outcome.

- **L. The landing at beta: the film, or the corrected scroll story?** Pending.
  - *Film:* S1′ (with MERGE) is inside the gate. One landing build, nothing thrown away; the
    longest pole with K. Depends on the spike passing his smoothness check.
  - *Scroll story:* S0a, S0b and S1-lite correct it and it opens the beta. The film ships during
    the beta. The scroll story's own speed work (S2 story half) would then be needed for the speed
    bar and thrown away when the film lands.
- **K. The calculator at beta: redesigned, or hidden?** Pending.
  - *Redesign first:* K.2-K.4 inside the gate. The teardown (every constant unsourced, 67% of area
    on a default species, a corner clip dropping 4-14% of polygons) means no small patch meets the
    number bar.
  - *Hidden:* off for beta under the hide-don't-block rule, rebuilt during beta.
  - **Either way, Ruling D ends at the gate.** Lee ruled 2026-10-02 that the live "$570M" dollar
    bar stays until the redesign ships, recorded as an accepted known overstatement. A known
    overstatement cannot be live on beta day, so D is amended in DECISIONS once Lee chooses.

## Pre-mortem

1. **The gate never arrives.** K, the film, T-pre and goal (2)'s unplanned W and P stack up and
   the beta drifts for months. Guard: the two decisions above are the levers, named before
   building; hide-don't-block applies at every wave, and the orchestrator reports the critical path
   (longest remaining pole) at each wave close.
2. **A wrong number ships on beta day anyway.** A figure appears that NUM never inventoried
   (a popup field, a share card, a film caption added late). Guard: NUM's final check runs on the
   gate build, extracting rendered text from the MATRIX route list and failing on any digit string
   not in the ledger.
3. **Beta opens on a broken map nobody tested on a real phone.** Headless WebKit is not iPhone
   Safari. Guard: Lee's phone look is a step of the gate, not an owed check; the speed guard runs
   throttled; known-issues is written before the label.

## Load-bearing assumptions

- The CI fix is a dev-dependency bump with no runtime change. If vite 8.1.6+ breaks vitest, CI
  takes a real relay. Check before the CI plan.
- Netlify Forms works with this static export. If not, BETA needs a different form path that
  still has no backend of ours; probe first.
- An error-monitoring free tier exists that meets the privacy rule. If not, OPS falls back to an
  edge-logged error beacon; the plan states which.
- MAPFIX's two defects are real. They were measured on recoloured captures; if either does not
  reproduce live, MAPFIX shrinks to the palette.

## Inversion

The rejected alternative is the approved order: finish Waves 1-6 as written, then open the beta.
It wins only if goal (2) were a beta precondition, which Lee ruled it is not; and it would keep
B′, C′, D′ and E′ ahead of the monitoring, CI, feedback and speed work the beta needs.

## Review Focus

1. A figure added after NUM's inventory reaches the gate build. Owner: NUM's rendered-text check.
2. The speed guard passes on a warm cache. Owner: SPEED (cold context, cache disabled, both
   asserted in the test).
3. A hidden layer or calculator is still reachable by deep link or preset. Owner: BETA (hide means
   unreachable, tested on the URL paths).
4. A test report from the form loses its place or layers on a phone. Owner: BETA.
5. The rebuild's fidelity result is green on a partial build. Owner: PIPE (the result records
   layer count and archive sizes against the previous version and fails on a drop).

## Revision log

**2026-10-23, written.** Re-sequenced from the path-to-beta grill (marvin session-d09d2c,
confirmed 2026-10-23), relayed to this session. Critic round 1 pending.
