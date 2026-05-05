---
status: layer-audit
current: Full layer audit — all layers disabled, re-enabling one at a time after verification
next: Synthesis layers — fire+age reconciliation as separate layers atop the faithful-data base tileset
testing: null
pinned: false
shipped:
  - date: 2026-04-13
    item: v9 PMTiles deployed (refactored bulk-FGDB pipeline, single-pass tippecanoe, Razor C1+W1-W4+N1 fixes)
  - date: 2026-04-10
    item: Pipeline refactor — bulk download + single-pass tippecanoe, replacing legacy monolith
  - date: 2026-04-08
    item: Forest-age vector tiles at z10, MapLibre v5 compatibility fix
  - date: 2026-04-01
    item: Tier 1 overview + z12 PMTiles rebuild (v8)
  - date: 2026-03-31
    item: Full data fidelity pipeline — 7-audit suite, water subtraction via GDAL/GEOS (63 min vs 72h projected)
---

# OpenCanopy — Roadmap

BC forest map: faithful government data rendered as PMTiles, served as a
public conservation reference. Architecture decision in March: base tileset
is government-truthful only; synthesis layers (fire-age reconciliation,
disturbance models) live as separate layers and are not part of the
open-source base.

## Current: Pipeline Fidelity Fixes (2026-05-03)

Forest-age overlay showed mismatches between overview and isolated class
views. Research identified dual root cause: `--coalesce-smallest-as-needed`
silently reassigning classification attributes (tippecanoe issue #523),
and decoupled color definitions between raster and vector pipelines.

**Completed:**
- Phase 1: Shared color constants (`forest-age-colors.json`) — single
  source of truth consumed by Python raster pipeline, TypeScript registry,
  DataLayer, PDF generator, story map, and color audit test. Old-growth
  color divergence (#15803d raster vs #0d5c2a vector) eliminated.
- Phase 2: Tippecanoe flag fixes — replaced `--coalesce-smallest-as-needed`
  with `--drop-densest-as-needed` (prevents silent attribute reassignment,
  issue #523), raised tile budget to 5MB, detail grids to 2048/1024-unit,
  buffer to 64, pinned 6 attribute types, removed `--extend-zooms-if-still-dropping`.
  Test config updated to match.
- Phase 3: tileMinZoom structural guard — explicit `0` fallback for non-raster
  layers (was `undefined`, defensively identical via `?? 0` in PmtilesLayers).
- Phase 4: Cross-zoom classification audit (`audit-cross-zoom.ts`) — traces
  features at z6 vs z12, fails on classification mismatch. Tile flag
  pre-validation (`validate-tile-flags.ts`) — catches misconfigurations before
  2-3hr rebuild. `PLANNED_GROSS_BLOCK_AREA` attribute type pinned.

**Remaining (see plan at `.claude/plans/tingly-bouncing-plum.md`):**
- Tile rebuild (v9 → v10) — all flag/guard changes committed, awaiting rebuild
- Phase 5: Raster-to-vector crossfade at z9-z10 (after v10 deploy)

Synthesis work paused until base data layer is trustworthy.

## Next: Landing Page Redesign (2026-05-05)

Scrollytelling overhaul replacing all-MapLibre scroll sections with a
hybrid photo + pre-rendered frames + live map experience.

**Direction:** Pre-rendered timeline frames (Option A). 12-15 composited
PNGs showing cutblock accumulation 1950-2025. No MapLibre during scroll
section — pure CSS/JS crossfade at 60fps. Live map activates only for
the camera dive to Fairy Creek and interactive exploration.

**Structure:**
1. Photo hero (old-growth canopy with mist, full-bleed)
2. Photo → raster overview crossfade
3. Timeline spread (pre-rendered frames, year counter)
4. Transition to live MapLibre (camera dive to Fairy Creek)
5. Old-growth detail (hatch pattern, bearing drift)
6. Photo closer + CTA (person among ancient cedars)

**Typography:** Instrument Serif (display) + Atkinson Hyperlegible Next
(body) + DM Mono (year counter/data). Design brief selection pending.

## Reference

- Architecture: `ARCHITECTURE.md`
- Audit scripts: `scripts/audit-*.ts` (12 scripts — source-to-tile tracing,
  geometry precision, spatial validation, adversarial testing, cross-source
  consistency, deep property validation, temporal checks, tile metadata,
  trend analysis, cross-zoom classification, unified runner)
- Audit support: `scripts/lib/audit-*.ts` (shared types, config, archiving)
- Repo: github.com/ToastedandTripping/opencanopy
- Outstanding audit items (non-blocking):
  - Okanagan Lake V3 test point needs adjustment
  - tenure-cutblocks DISTURBANCE_START_DATE property issue
  - Cross-source R1 reclassify as informational (BC VRI data limitation)
