---
status: shipped
current: null
next: "Deploy relay/production-readiness; post-deploy smoke-check WFS-working states (empty/zoom need the live edge fn); then /code-refresh (author in-repo ARCHITECTURE.md + fix the pre-existing WfsLayers hooks-order/StrictMode dev cleanup crash)"
testing: null
pinned: false
shipped:
  - date: 2026-06-09
    item: "Production-readiness & shareability push (branch relay/production-readiness, 5 commits, +~1.5k LOC, 462 tests): per-layer error/empty/zoom status states (the centerpiece — replaces silent blank failures), OG/Twitter share card + metadataBase (blank previews fixed), privacy page + footer, WFS-proxy per-IP rate limiting, GitHub Actions CI, next 16.2.7. Live verification caught + fixed false 'BC data unavailable' errors on tile-backed layers during WFS hiccups. TileProgress dead code removed; pickDefinedPaint centralizes invariant #4."
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

## Reference

- Architecture: `state/plans/opencanopy-audit-architecture.md`
- Audit pipeline: `tools/audit/` (7-audit suite — source-to-tile tracing,
  geometry precision, spatial validation, adversarial testing, cross-source
  consistency, deep property validation, unified runner)
- Repo: github.com/ToastedandTripping/opencanopy
- Outstanding audit items (non-blocking):
  - Okanagan Lake V3 test point needs adjustment
  - tenure-cutblocks DISTURBANCE_START_DATE property issue
  - Cross-source R1 reclassify as informational (BC VRI data limitation)
- From the 2026-06-09 production push (for the follow-up /code-refresh):
  - **WfsLayers** has `if (layer.tileSource) return null` BEFORE its hooks (rules-of-hooks
    smell). Causes a dev-only StrictMode cleanup crash (`map.getMap()` undefined in the
    teardown). Pre-existing on main; production unaffected (effects run once). Fix the
    hooks order + guard the cleanup.
  - `conservation-priority` (258K fill from z0) left ungated — no degradation measured at
    z5; revisit with a real perf trace before gating `tileSource.minZoom`.
  - Empty/zoom/WFS-only-layer rendering verified by unit tests + wiring, NOT live (the
    `/api/wfs` edge fn doesn't run under `next dev`). Smoke-check on the live deploy.
  - Vestigial WFS fetch for tile-backed layers (data isn't rendered, fetch still fires) —
    candidate to skip entirely as an optimization.
