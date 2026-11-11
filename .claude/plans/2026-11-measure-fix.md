# MEASURE: the logged-hectares count stops overstating (cap on drawn area, overlaps dissolved)

*Plan, 2026-11-11, revised after critic r1 (FAIL) and r2 (CONCERN, gate passed); all folded. Session marvin/canopy (driven by marvin session-f1a7d3), brief item 5, second of two relays (after HEAVY). Tier: Standard.*

## Intent (grilled)

Grill skipped: the defects, the fix and the public-number permission are already ruled. The 2026-10-08 measurement (`research/overpaint-2026-10-08/accuracy-report.md`, 4.5 and "Prerequisites") found two overstatements in the scrub table behind the landing page's "5.8 million hectares"; the program routes them as "serious whatever L is" (`beta-resequence.md`, S1-lite scope); Lee, 2026-10-23 (DECISIONS, "Logged hectares means...", amendment): "a downward correction may ship before the merge. The cap fix (on max(attribute, geometry); nine polygons, 82,920 ha) and the overlap dissolve go out ... as soon as they are built, and the headline takes the corrected, floored figure (very likely 5.7 million against the shipped 5,888,477 ha); the merge then changes it once more." Anchor: every public "logged since 1950" figure is the area actually logged, counted once, with tenure boundaries out by their drawn size as well as their recorded size. Anti-goals: no new measure (FTEN only, the inventory merge is MERGE's); undated blocks stay out of the count (unchanged); no overlay picture regeneration here (below); no /map tile rebuild.

## The two defects (verified in code, 2026-11-11)

1. **Cap on the attribute, not the shape.** `scripts/build-scrub-tables.py:113-115` (and `scripts/build-year-overlays.py:444-450`) drop a polygon when `PLANNED_GROSS_BLOCK_AREA >= 2000`. Nine dated polygons are drawn at 2,532-18,561 ha (82,920 ha together) but carry 0.1-1,000 ha in the attribute (e.g. 1991: 17,989 ha drawn, 0.1 ha recorded); they are tenure-boundary artefacts of exactly the kind the 2026-09-02 ruling excluded (accuracy-report 4.5).
2. **Overlaps counted twice.** The scrub total sums each block's attribute area (`build-scrub-tables.py:125`), so re-harvested and overlapping blocks count twice: the dissolved union is 1.7% lower in 2025 (accuracy-report, "Sum vs union").

Defect 3 of 2026-10-08 (`/raster` served `max-age=0`) stays with S2-pages (C1), per the program.

## Design (revised after critic r1, FAIL: every must-fix folded)

**The count, exactly.** Kept set: cutblocks dated 1950-2025 (`DISTURBANCE_START_DATE`), not tenure boundaries. The one block dated before 1950 (14.64 ha) is excluded rather than folded into 1950 as today (the ruling's definition is "dated 1950-2025"; excluding understates). Undated stay out (unchanged).

- **Shared rule, `scripts/lib/cutblock_area.py`:** `CAP_HA = 2000`; `repair(geom)`: `shapely.make_valid`, keep polygonal parts only (any non-polygonal remainder is logged); `geometry_area_ha(geom)` on the repaired geometry in EPSG:3005 (pyproj); `is_tenure_boundary(attr_ha, drawn_ha) = max(attr_ha, drawn_ha) >= CAP_HA`, with drawn area measured after repair. 431 kept-set polygons are invalid on this checkpoint and 12 throw in a typical overlay unrepaired (critic r1); repair changes total area by about 2 parts in 10^8. No geometry error is ever caught and skipped: the blanket `except` on the geometry path in both builders becomes fatal (a JSON parse error on a line stays skippable and is counted). Each run prints an accounting line that must close: `read = kept + undated + pre-1950 + post-2025 + tenure-boundary + zero-area + unparseable`. The nine known boundaries measure 83,233 ha in EPSG:3005 (the 82,920 of 2026-10-08 was a spherical approximation).
- **Union, `build-scrub-tables.py` (cutblocks only):** one STRtree over all kept polygons, each with a rank (year, then input order). For polygon p of rank r: `new(p) = area(p - unary_union(hits with rank < r))`. Summing `new(p)` over any total order is the telescoping identity for the area of a union, so same-year overlaps are subtracted and order changes nothing (critic r1). `annual[y] = Σ new(p)` over year y; `total = Σ annual` (one quantity). The JSON adds `"areaMeasure": "dissolved-union-drawn-ha"`, `"areaCapRule": "max(recorded, drawn) >= 2000"`, `"checkpoint": {"manifestTimestamp": "2026-05-06T15:26:00.354Z", "bytes": <ndjson size>, "sha256": <ndjson sha256>}` (from `data/checkpoint/preprocessed/_manifest.json` plus the file itself, not an mtime; the no-increase test is keyed on it), and keeps `"areaCap": 2000`. The builder takes output-path overrides (the scrub JSON and `crosscheck.json`) honoured only when `VITEST` is set and refused otherwise, the same fence shape as HEAVY. Implementation notes (critic r2): never pre-clip hits with `clip_by_rect` (it returns invalid geometry; 30 TopologyExceptions on the dense window); if clipping, `intersection` with a box on repaired geometry; record peak RSS with `/usr/bin/time -v`. Fire scrub unchanged. Peak memory is expected at a few GB (183,726 polygons, 59.96 M vertices, measured by critic r1), but unmeasured is heavy.
- **Acceptance, before any number is public (replaces the 2026-10-08 window, which mixed in the nine; critic r1):**
  0. The kept set is right on real data (both methods share it, so this is the only check of it; critic r2 measured it independently): bucket counts read 220,745 = kept 183,725 + undated 36,608 + after-2025 332 + out-of-range-low 1 (the "pre-1950" block is dated year 1200, an entry error) + tenure boundaries among dated 1950-2025 79 (70 by recorded area, 9 by drawn area only, the nine 83,233.26 ha) + zero-area 0 + unparseable 0; 431 repaired, none empty; Σ drawn EPSG:3005 of the kept set 5,875,854.39 ha. Bucket order: date first (unparseable, undated, out of range), then the cap, then zero-area (drawn area 0 after repair). Any difference stops the run and is reported.
  1. Per-year agreement: `annual[y]` from the rank method equals the tile method's per-year union increment within 1 ha for every year (replaces "Σ annual = total", true by construction; critic r2).
  2. total < 5,888,477.44 (the shipped figure) and total < Σ drawn of the kept set (5,875,854.39): a sum-not-union bug would equal the latter, so strict inequality catches it. If the total does not fall below the shipped figure: stop, report to the coordinator for Lee, ship nothing.
  3. A second, independent method agrees within 1 ha (not 0.01%, which would admit about 570 ha): clip the kept polygons to a fixed grid of tiles (intersection with a box, on repaired geometry) and `unary_union` per tile, summing tile areas, in the same heavy run (10 km and 2 km tiles gave identical totals in critic r2's dense-window test). Both totals, both methods and the checkpoint date go to a committed `research/measure-2026-11/crosscheck.json`; a test pins the scrub total to it.
  4. The 2026-10-08 sparse Fort Nelson box (2025 union 1,418 ha, accuracy report 1.2, none of the nine nearby) reproduces within 0.5%.
  Plausibility band: about 5.65 to 5.81 million. A result outside it stops the run and goes to the coordinator for Lee; it never adjusts the figure. (Lee's "very likely 5.7 million" is consistent with the band by coincidence of the chain, not by derivation.)
- **Overlay builder:** imports the shared rule and the repair, with its geometry `except` made fatal the same way; a fixture test covers its cap. The 76 shipped PNGs are not regenerated here (S0b's dated-only rebuild does it in one heavy job). **Stated plainly: until S0b, the story pictures overstate** (they paint about 5.66 times the logged area, mostly from painting every touched cell at 1,024 px, accuracy report 2.2, with the undated baseline on top; the nine are 0.24% of it), while the count no longer does.
- **Copy, constrained.** Hero (`HeroSection.tsx`, "5.8 million hectares"): the new total floored to 0.1 million. Chapter (`chapters.ts`, logging-timeline body): its "nearly 6 million hectares" becomes the same floored figure as the hero, and its em dash goes; nothing else in the sentence changes. The Fable reviser (model fable, medium) is briefed to change only the figure and the em dash, add no claim and re-certify none; then the Part 1 checklist re-run. Routed, not touched: "Each red mark is a cutblock" and "every tree was removed" (unsupported by the shipped picture and data, critic r1) to S0b/S1′ copy; the hero subline ("Logged since 1950. An area larger than Nova Scotia.", two fragments) to S0a copy; the Nova Scotia comparison's source to NUM. The Nova Scotia test compares 5.53M ha to the figure the reader sees, not the raw total.
- **Tests:** `hero-figure.test.ts`: hero ≤ scrub total and within 0.1M of it; chapter figure equals hero figure; `total ≤ 5888477.44` on this checkpoint (the no-increase guard, Review Focus 5); the JSON declares `areaMeasure`, `areaCapRule`, `checkpoint`, `areaCap`; the scrub total equals `crosscheck.json`; `CAP_HA` in `scripts/lib/cutblock_area.py` equals `CUTBLOCK_AREA_CAP_HA` (read from the Python source). A vitest fixture test runs the Python builder through `child_process` on a committed fixture data file with expected values (`scripts/fixtures/cutblock-area/`, so C5b's TypeScript twin can reuse it): two overlapping same-year squares, one overlapping an earlier year, one large-drawn small-recorded, one invalid self-intersecting, a MultiPolygon, a polygon with a hole, a pair straddling a tile edge, recorded area exactly 2,000, and years 1949, 1950, 2025, 2026, malformed and undated. Outputs go to a temp dir under `VITEST`; it asserts the committed `cutblocks-scrub.json` and `crosscheck.json` are byte-identical before and after. Mutants: sum not union; same-year overlap not subtracted; reverse order; no repair; attribute-only cap; tile method double-counting a straddling pair. CI: `actions/setup-python` pinned (3.12) and `pip install shapely==2.1.2 pyproj==3.7.2` in that interpreter, added before the tests; under `CI` the fixture test fails, never skips, if they are missing. The workflow change is proven on the release branch's own CI run before the push to main (a pushed branch runs CI), not first on main.

## Run failure responses

heavy-run 240 (lock held) or 241 (memory): `--retry`, then report to the coordinator, as HEAVY specifies. A killed run writes nothing: the JSON and `crosscheck.json` are written last, so the committed files stand.

## Contracts

`scripts/lib/cutblock_area.py` is C5b's Python twin (`glowing-dazzling-brooks.md:390-418`, "one area contract"); its fixture seeds C5b's shared fixture set, and its label is the `area-contract v1` S1-lite versions. Of C5's checks this plan meets: one definition for the count (cap rule, union, 1950-2025), versioned (checkpoint identity in the JSON), reconciled by an independent method; it does not meet the picture-count reconciliation (S0b) or the map-count one (T-pre). Fire's scrub is unchanged and needs none of this (fires are dated and capless).

## Order of work

1. HEAVY merged and released first (`scripts/heavy-run.mjs` must exist on the branch).
2. B1, code and tests: the shared module, both builders, the fixture and hero tests, the CI step.
3. The run: `node scripts/heavy-run.mjs --job scrub-cutblocks -- python3 scripts/build-scrub-tables.py --dataset cutblocks`, only when the 1-minute load is under 8 and at least 16 GiB is free, announced to the coordinator first; peak memory and wall time recorded.
4. B2, results: the JSON, `crosscheck.json`, the copy (after the Fable pass), docs.

## Docs

ARCHITECTURE (the logged-hectares definition: drawn-or-recorded cap, dissolved union, 1950-2025, the evidence file); the builder docstring; the hero test header; the hand-off's "Next (item 5)" line replaced and its "Measure-merge defects found 2026-10-08" Owed line (which still says the defects fold into the merge before any public number changes, against the 2026-10-23 amendment) closed through the writer; `beta-resequence.md` amended where it says "the cap correction alone takes it to about 5,805,557" (that subtracted drawn area from a sum of recorded areas; the nine's recorded areas total 1,619.4 ha), and its S1-lite/C5 notes pointing here; ROADMAP. **Handed to MERGE:** this definition (cap rule, union, 1950 start) for the inventory splice.

## Out of scope (Parking Lot lines at close)

- Regenerating the story overlay PNGs with the shared cap: S0b (one heavy build with dated-only frames).
- **Temporary story/map divergence, one owner: T-pre** (its scope note in `beta-resequence.md` is amended at close to name the drawn-area cap for tiles and the proxy CQL). /map's cutblocks filter (the MapLibre filter on `CUTBLOCK_AREA_CAP_HA`) and the WFS proxy's CQL cap both test the recorded attribute, so /map and the proxy still show the nine until the tiles and the proxy carry the drawn-area rule; T-pre owns both (C5's single definition, `beta-resequence.md`).
- The film's dots and the inventory merge: MERGE / S1′.
- `/raster` cache headers: S2-pages (the brief's item 5 listed it; reported to the coordinator as a deviation from the brief, following the program).
- The chapter's unsupported claims (S0b/S1′), the hero subline's fragments (S0a), the Nova Scotia source (NUM).

## Review Focus

1. The union's correctness on real data: the four acceptance checks (owner: the run, recorded in `crosscheck.json`).
2. Multipolygons and holes in the area function (fixture test).
3. The heavy run respects the host rule and the lock (recorded command, load, memory, time).
4. Copy consistency: hero and chapter carry one figure (test).
5. No public number goes up: `total <= 5888477.44` pinned in the hero test, and the run stops if it does not fall.

## Release

A visual release (the hero number changes): a phone check is owed to Lee after it ships, non-blocking. Before and after figures go to the coordinator for Lee's board (coordinator, 2026-11-11). Lane S, kind `behaviour`. Approval quotes both Lee texts: the 2026-11-10 Deploy amendment verbatim, marked relayed by marvin session-f1a7d3, and his 2026-10-23 amendment to the logged-hectares entry ("a downward correction may ship before the merge..."). Conditions, stated in the request: the number falls; no critic round stands at FAIL; this applies the 2026-10-23 amendment partially (the cap and the dissolve, not the merge). Guards: identity, console, live hero text equals the committed figure, `/` and `/map` 200, `story` live check.

## Gates

Plan-reviewer at xhigh, at most three rounds. Ted, Razor. No Jen (no layout change; the copy goes through Fable and the checklist). Checks: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.
