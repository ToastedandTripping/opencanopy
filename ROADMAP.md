---
status: in-progress
current: "Layer-fidelity Wave 2 ops tail (tile regeneration from rasterizable derivative + R2 v2 upload + pixel verify + deploy), then waves 3-4 + 2.5 (Jen design pass: parks/conservancies/species/preset opacity/Threats cutblock restyle; verification net; old-growth-at-risk conflict layer — knobs decided, needs focused critic pass)"
next: "Wave 3 design pass (Jen spec first) and the Tier-2 conflict-layer focused critic pass. Wave 4 must also repair 4 pre-existing monitoring tests that fail since the 06-02 default-layer reset (bare-URL navigation expects layers that are no longer defaultEnabled; R2 HEAD check fails from Playwright context but R2 verified healthy via curl)."
testing: null
pinned: false
shipped:
  - date: 2026-06-12
    item: "Layer-fidelity Wave 2 code (branch relay/layer-fidelity-w2, 6 commits, 511 tests): per-class isolation raster themes in registry palette (old-growth #0d5c2a dark green — gold theme deleted), forest-age-palette.json as single color authority for python script + TS registry (+ CalculatorPanel/pdf-generator stragglers), client flipped to raster/v2/ R2 dirs (old dirs kept one release), RASTER_THEME_COLORS override removed, color-audit rewritten with cross-language --dump-themes guard (Razor: PASS-WITH-WARNINGS → all closed → PASS). Plus simplify-for-raster.py prep: full-fidelity NDJSON (9.8GB = ~63GB RSS) exceeds the 32GB build machine; half-pixel-at-z9 simplify feeds the raster build only."
  - date: 2026-06-12
    item: "Layer-fidelity Wave 1 DEPLOYED + live-verified: proxy bbox-in-CQL fix (fish-streams/tap-deferrals/cutblocks all return features live; D3 e2e gates green), satellite z-order verified on production (index 26, all 38 overlays above, labels on top), MapTiler backdrop-dark confirmed zero layer-* collisions. Deploy hotfix en route: Netlify edge bundler treats every top-level file in netlify/edge-functions/ as an entry point — helper modules must live in a subdirectory (wfs-bbox-url.ts → lib/). Deploys are CLI/API-driven (npx netlify-cli deploy --prod --no-build after local build; CI is test-only, no auto-deploy on push)."
  - date: 2026-06-11
    item: "Layer-fidelity Wave 1 (branch relay/layer-fidelity-w1, 7 commits, 487 tests): proxy bbox-in-CQL fix (restores fish-streams, tap-deferrals + cutblocks supplemental — GeoServer rejects bbox+cql_filter together), imperative satellite z-order (anchor below first overlay/symbol, toggle-order independent), WfsLayers hooks-order fix + tile-backed fetch skip (StrictMode dev crash gone). Razor FAIL→fixed→PASS-WITH-WARNINGS; behavioral eval PASS on Wave 1 checks. Pre-existing finding logged: LayerPanel button-in-button nesting (Wave 3 ride-along)."
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

- Architecture: `ARCHITECTURE.md` (in-repo, authored 2026-06-10)
- Audit pipeline: `scripts/audit-*.ts` (7-audit suite — source-to-tile tracing,
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
