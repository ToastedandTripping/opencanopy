---
status: in-progress
current: "Layer Waves 1+2 + landing-story + low-zoom legibility/old-growth-swatch all DEPLOYED & live-verified (Jun 18). Both grade-C a11y FAILs CLEARED. Wave 3 styling pass now implemented & reviewed (conservancies slate fill + dashed outline, cutblocks red boundary, species circles, legend-swatch fidelity) — 532 tests/build/lint green; PENDING deploy + live visual verify over dark basemap AND satellite. Open fronts: (a) Tier-2 old-growth-at-risk conflict layer (offline FTEN/FOM × VRI pipeline → new PMTiles → registry; knobs decided, needs focused critic); (b) deferred perf — the zoom re-render cascade through 18 DataLayers (the z5-7 slowness root, NOT fixed by the opacity retune); (c) 4 pre-existing broken monitoring tests; (d) other grade-C ops gaps (error boundary, MapTiler domain-lock, CSP, uptime/error monitoring, rollback doc)."
next: "Deploy + live-verify Wave 3 layer styling over both backgrounds. Then the Tier-2 conflict-layer critic pass, and the deferred zoom re-render cascade refactor (measure z5-7 FPS first). DEFERRED batch (one relay, high-risk DataLayer opacity path): 3.8 preset opacity overrides + cutblocks boundary-aware timeline. Wave 4 repairs the 4 monitoring tests failing since the 06-02 default-layer reset (bare-URL navigation expects no-longer-defaultEnabled layers; R2 HEAD check fails from Playwright but R2 healthy via curl). IF a live z6-8 check shows the 3 densest layers (conservation-priority/ungulate/forestry-roads) still thinned by tippecanoe drop-densest, a tile rebuild with a looser drop budget — else the opacity retune already suffices."
testing: null
pinned: false
shipped:
  - date: 2026-06-19
    item: "a11y grade-C FAILs closed + Wave 3 styling pass (branch marvin/session-529466, not yet deployed). a11y: the nested-<button> FAIL was already fixed by the 06-18 LayerPanel redesign (regression test green); text-zinc-600 → text-zinc-400 at 11 informational sites (clears WCAG AA — zinc-500 would still fail at small text per the audit's own WARN). Wave 3 (Jen-spec'd values, Lee-approved): conservancies line→fill (cool slate #cbd5e1 faint fill + dashed white outline); cutblocks fill→boundary (near-zero 0.04 fill + bold red #dc2626 outline 0.9 — de-collides from forest-age harvested #ef4444, which was a fill-vs-fill clash); species-at-risk circles bumped (radius 5/7/10, opacity 0.85, pale-amber #fde68a halo). Supporting: optional `dasharray` on style.outline (PMTiles render path only — WFS path ignores style.outline, caveat documented); opacity-audit refined to credit outline-dominant fill layers by their boundary opacity (Math.max with style.outline.opacity); LayerPanel + MapLegend swatches render bordered/dashed for boundary layers (legend↔map fidelity, caught in review as a self-introduced regression). Parks (3.5) was already shipped 06-18. 3 parallel review agents: 2 correctness clean, cleanup findings folded in. 532 tests / build / 0-new-lint green. DEFERRED (Lee): 3.8 preset opacity overrides AND cutblocks boundary-aware timeline — both in the high-risk DataLayer opacity path, one batch. Visual verify pending on deploy (local can't render faithfully: no worktree MapTiler key, WFS species needs the /api/wfs proxy, R2 serves tiles cross-origin without CORS to localhost)."
  - date: 2026-06-18
    item: "Low-zoom legibility + old-growth swatch + LayerPanel a11y DEPLOYED & live-verified on opencanopy.ca (plan .claude/plans/misty-cuddling-yeti.md, critic-gated; main 8366792). DIAGNOSIS that reshaped scope: the 12 secondary layers were never 'locked at z10' — PMTiles build z4-12 and render from z0; they painted at 0.18-0.40 alpha (invisible, not absent). FIX = registry opacity retune, NOT raster expansion. All 12 legible by ~z8.5; parks 0.1 white-wash → emerald fill + crisp outline. Old growth (tap-deferrals): dashed gold line → solid dark-green fill + solid gold border, now tile-backed (reuses the forest-age source filtered class=old-growth at z10+ and the existing old-growth raster z4-9 — zero new pipeline) via a new generic style.outline primitive; WFS path inert so popups show PMTiles attrs (class/age); resolves WFS-fragility (P2) for it. species-at-risk circles bumped perceptible (3-8px + stroke). LayerPanel: all categories expanded by default, demoted to quiet labels, rows collapsed to a single role=switch — CLEARS BOTH grade-C a11y FAILs (nested <button> + text-zinc-600 contrast); first LayerPanel test added. Oracles updated (opacity-audit parks); stale tap-deferrals WFS-line refs cleaned (dual-source-status, satellite-zorder, schema-audit, e2e live-health, dead --color-tap-deferrals CSS var). 532 tests, build clean (MapTiler key verified in out/), lint 0 errors. Live-verified z8/z11/z14. Deferred: the zoom re-render cascade through 18 DataLayers (the z5-7 slowness root)."
  - date: 2026-06-18
    item: "Ko-fi support link added to the landing footer (ko-fi.com/toasted40013) as an emerald give-back CTA; external link + rel=noopener, AA contrast on the dark footer, aria-label. main 8366792, deployed + live-confirmed via curl."
  - date: 2026-06-18
    item: "Landing-story refinement DEPLOYED (plan .claude/plans/swirling-chasing-goose.md, critic-gated; main 1b61b01). Foundational: overlay opacity decoupled from yearFilter via a per-chapter `overlays` declaration (StoryMap is sole writer of each overlay's raster-opacity). New beat flow: hero(photos + red '8 million') → baseline(pre-1950 red fades in scroll-coupled, no counter) → timeline(inverse-cumulative scrub blended 0.4 toward linear so 1950-1980 reads, 800→600vh, flat camera) → fire(amber wildfire 1917-2025 over persisted red, holds on red+text ~22% before the orange begins, steady LINEAR counter, 'wildfires' label) → ending(scars persist + closing stat '35,000 ha of BC's largest old growth remain', Price/Holt/Daust 2020). Deleted zoom-in/old-growth-hatch/explore 3D beats (machinery left inert). New: build-scrub-tables.py (cumulative-area pacing curves), build-year-overlays.py parametrized --dataset {cutblocks|fire} + --mode {age-graded|additive}, 109 fire PNGs (1917-2025, 768px), scrub.ts + boundary tests. 522 tests, source-registration oracle 13→14. Favicon replaced with old-growth-rings mark (icon.svg + 3-frame .ico + apple-icon). Hero figure corrected: '5 million' → true 8.24M ha gross / 8.19M polygon (FTEN dated 1950-2025), 'larger than Ireland', softened 'never recovered' → 'most of it will never be old growth again'."
  - date: 2026-06-18
    item: "/production audit = grade C (52/100, report at marvin state/production-audits/opencanopy-2026-06-16.md). 5 specialists, 0 security/data FAILs; 2 a11y FAILs (LayerPanel nested <button> breaks AT; text-zinc-600 fails WCAG AA). Top WARN themes: no React error boundary, MapTiler key needs domain-lock, no CSP, zoom-event re-render cascade through 18 DataLayers, no uptime/error monitoring, no rollback doc, 112KB core-js polyfill to WebGL-only browsers. DataLayer.tsx flagged by 3 specialists (highest-risk surface). Remediation plan in the report, relay-ingestible."
  - date: 2026-06-12
    item: "Layer-fidelity Wave 2 DEPLOYED: per-class isolation rasters regenerated for all 5 themes z4-z10 in registry palette, uploaded to R2 raster/v2/ (12,798 tiles, local↔R2 parity verified), client flipped. Fixes the opaque-black class-toggle blanking; old-growth renders dark-green (gold theme deleted). Branch relay/layer-fidelity-w2 merged."
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
