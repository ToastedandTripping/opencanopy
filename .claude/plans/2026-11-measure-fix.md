# MEASURE: the logged-hectares count stops overstating (cap on drawn area, overlaps dissolved)

*Plan, 2026-11-11. Session marvin/canopy (driven by marvin session-f1a7d3), brief item 5, second of two relays (after HEAVY). Tier: Standard.*

## Intent (grilled)

Grill skipped: the defects, the fix and the public-number permission are already ruled. The 2026-10-08 measurement (`research/overpaint-2026-10-08/accuracy-report.md`, 4.5 and "Prerequisites") found two overstatements in the scrub table behind the landing page's "5.8 million hectares"; the program routes them as "serious whatever L is" (`beta-resequence.md`, S1-lite scope); Lee, 2026-10-23 (DECISIONS, "Logged hectares means...", amendment): "a downward correction may ship before the merge. The cap fix (on max(attribute, geometry); nine polygons, 82,920 ha) and the overlap dissolve go out ... as soon as they are built, and the headline takes the corrected, floored figure (very likely 5.7 million against the shipped 5,888,477 ha); the merge then changes it once more." Anchor: every public "logged since 1950" figure is the area actually logged, counted once, with tenure boundaries out by their drawn size as well as their recorded size. Anti-goals: no new measure (FTEN only, the inventory merge is MERGE's); undated blocks stay out of the count (unchanged); no overlay picture regeneration here (below); no /map tile rebuild.

## The two defects (verified in code, 2026-11-11)

1. **Cap on the attribute, not the shape.** `scripts/build-scrub-tables.py:113-115` (and `scripts/build-year-overlays.py:444-450`) drop a polygon when `PLANNED_GROSS_BLOCK_AREA >= 2000`. Nine dated polygons are drawn at 2,532-18,561 ha (82,920 ha together) but carry 0.1-1,000 ha in the attribute (e.g. 1991: 17,989 ha drawn, 0.1 ha recorded); they are tenure-boundary artefacts of exactly the kind the 2026-09-02 ruling excluded (accuracy-report 4.5).
2. **Overlaps counted twice.** The scrub total sums each block's attribute area (`build-scrub-tables.py:125`), so re-harvested and overlapping blocks count twice: the dissolved union is 1.7% lower in 2025 (accuracy-report, "Sum vs union").

Defect 3 of 2026-10-08 (`/raster` served `max-age=0`) stays with S2-pages (C1), per the program.

## Design

- **One cap rule, shared.** New `scripts/lib/cutblock_area.py`: `CAP_HA = 2000`; `geometry_area_ha(geom)` (shapely, reprojected to BC Albers EPSG:3005 with pyproj, polygon and multipolygon, holes subtracted); `is_tenure_boundary(attr_ha, geom_ha) -> max(attr_ha, geom_ha) >= CAP_HA`. Both builders import it. `CAP_HA` stays pinned to `CUTBLOCK_AREA_CAP_HA` in `src/lib/layers/registry.ts` by the existing hero-figure test.
- **Scrub table, cutblocks only** (`build-scrub-tables.py`): for each dated 1950-2025 polygon not excluded by the shared rule, reproject once; process years ascending; per year, the area newly logged is the area of that year's polygons not already covered by earlier years or earlier polygons of the same year (`p.difference(unary_union(STRtree hits among already-counted polygons)).area`, with a per-year tree rebuilt as years advance). `annual[y]` is that new area; `total` is the dissolved union; `cumulativeNorm` as now. The JSON gains `"areaMeasure": "dissolved-union-ha"` and keeps `"areaCap": 2000`, now meaning drawn or recorded. Fire scrub unchanged.
- **Run under HEAVY.** The union is unmeasured, so it is heavy: `node scripts/heavy-run.mjs --job scrub-cutblocks -- python3 scripts/build-scrub-tables.py --dataset cutblocks`, started only when the 1-minute load is under 8 and announced to the coordinator first (host rule, 2026-11-11). Its peak memory and wall time are recorded; if it measures under 8 GB, that is written beside the job so later runs know.
- **Cross-check before trusting the output:** the new total must be at or below 5,888,477 ha minus the nine polygons' recorded areas (the cap alone, about 5,805,557 per the program) and within 0.5 percentage points of the 1.7% union shortfall the 2026-10-08 raster measurement found for 2025; a result outside that is investigated, not shipped.
- **Overlay builder:** imports the shared rule, so the next overlay build (S0b, dated-only frames) excludes the nine polygons. The 76 shipped PNGs are not regenerated here: the picture today also paints the undated baseline, which S0b removes in the same heavy rebuild, so one 12 GB build serves both. Until then the frames still show the nine polygons; the count no longer includes them. Hand-off and Parking Lot say so.
- **Copy.** The hero (`HeroSection.tsx:122`, "5.8 million hectares") takes the new total floored to 0.1 million. The logging chapter (`chapters.ts:142`, "nearly 6 million hectares ... cutblock — an area") is made consistent with the hero (the same floored figure, not a rounded-up "nearly 6"), and its em dash goes. Both sentences get a Fable reviser pass (model fable, medium), then the orchestrator's Part 1 checklist re-run, before commit. "Larger than Nova Scotia" (55,284 km², 5.53M ha) stays only if the new total is above 5.53M; otherwise it is cut (the existing test enforces this).
- **Tests.** `src/test/lib/hero-figure.test.ts`: the hero is at or below the scrub total and within 0.1M of it (tightened from 0.2M: the floor to 0.1M is the rule); the chapter carries the same figure as the hero; the scrub JSON declares `areaMeasure` and `areaCap`. New `scripts/test/` is not collected by vitest, so the Python is tested by a small fixture run in vitest through `child_process` (three overlapping squares and one large-drawn small-recorded polygon in a temp ndjson, the builder pointed at it by an env override): the union is counted once, the large-drawn polygon is excluded, and an attribute-only cap mutant counts it. Revert proofs recorded.

## Out of scope (Parking Lot lines at close)

- Regenerating the story overlay PNGs with the shared cap: S0b (one heavy build with dated-only frames).
- /map's cutblocks layer filters on the tile attribute (`CUTBLOCK_AREA_CAP_HA` in the MapLibre filter); the nine polygons still draw on /map until the tiles carry a drawn-area property: T-pre or REBUILD.
- The film's dots and the inventory merge: MERGE / S1′.
- `/raster` cache headers: S2-pages.

## Review Focus

1. The union's correctness on real data: the cross-check bounds above (owner: the run, recorded).
2. Multipolygons and holes in the area function (fixture test).
3. The heavy run respects the host rule and the lock (recorded command, load, memory, time).
4. Copy consistency: hero and chapter carry one figure (test).
5. No public number goes up (the hero test's upper bound).

## Release

A visual release (the hero number changes): a phone check is owed to Lee after it ships, non-blocking. Before and after figures go to the coordinator for Lee's board (coordinator, 2026-11-11). Lane S, kind `behaviour`; approval: the standing yes (DECISIONS Deploy entry, amended 2026-11-10, verbatim, relayed), which excludes "changing a public number before the measure-merge fixes": this release is those fixes. Guards: identity, console, live hero text equals the committed figure, `/` and `/map` 200, `story` live check.

## Gates

Plan-reviewer at xhigh, at most three rounds. Ted, Razor. No Jen (no layout change; the copy goes through Fable and the checklist). Checks: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.
