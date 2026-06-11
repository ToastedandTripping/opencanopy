# Plan Critic — Layer Fidelity (2026-06-10)

Critic: separate Opus reviewer. Method: every load-bearing claim verified against
the actual code at the cited file:line locations (not trusted from the plan).

## Verification of the plan's diagnoses (code-confirmed)

| Claim | Verdict | Evidence |
|---|---|---|
| Satellite opacity 1, raster `<Layer>` has no `beforeId` | TRUE | registry.ts:736 `opacity: 1`; DataLayer.tsx:1043-1050 satellite `<Layer>` has no `beforeId`; 1087-1119 forest-age raster `<Layer>`s also unanchored |
| Per-class client logic correct; tiles broken at source | PLAUSIBLE (code side correct) | DataLayer.tsx:1062-1121 maps labels→slugs, swaps default↔per-class raster opacity exactly as described. Tile-pixel claim is empirical (not re-verified here, but consistent) |
| Proxy sets `bbox` AND `CQL_FILTER` as separate params | TRUE | wfs-proxy.ts:705 sets `bbox`, :710-711 ALSO sets `CQL_FILTER` when present. GeoServer rejects the combination |
| Only 3 layers carry a cqlFilter | TRUE | wfs-proxy.ts LAYER_CONFIG: cutblocks (`PLANNED_GROSS_BLOCK_AREA < 2000`:97), tap-deferrals (`PROJ_AGE_1 >= 250`:102), fish-streams (`STREAM_ORDER >= 3`:115). **None contain an OR** |
| `GEOMETRY` is the correct geometry column | TRUE | Point path already uses `INTERSECTS(GEOMETRY, POINT(...))` (wfs-proxy.ts:633) with bare Albers coords and works live |
| Parks fill `rgba(255,255,255,0.1)` + white outline | TRUE | registry.ts:389-390 |
| Species-at-risk circle 1→2.5px @ opacity 0.4 | TRUE | registry.ts:614-625 |
| Conservancies line-dash only | TRUE | registry.ts:421-427 (`line-dasharray: [6,4]`) |
| `RASTER_THEME_COLORS` gold override | TRUE | DataLayer.tsx:48-50 + applied at :403-405 |
| WfsLayers early-return above hooks | TRUE | DataLayer.tsx:478 `if (layer.tileSource) return null;` sits ABOVE five `useEffect` (481+) — rules-of-hooks violation, StrictMode dev crash |
| WFS fetch is vestigial for tile-backed layers | TRUE (stronger than stated) | The early return at :478 means WfsLayers renders NOTHING for tile-backed layers at ANY zoom. The documented "dual-source high-zoom WFS" (DataLayer.tsx:857-880, `wfsMinZoom = tileMaxZoom+1`) is **dead code** — no WFS layer is ever added for tile-backed layers. `loadData` still fetches (:910-1002), data lands nowhere |
| forest-age rasterOverview minZoom 4 maxZoom 9; client renders to maxZoom+1 | TRUE | registry.ts:70-74; DataLayer.tsx:1084/1090/1108 use `maxZoom + 1` |
| Registry vector palette: og `#0d5c2a`, mature `#4ade80`, young `#f97316`, harvested `#ef4444` | TRUE | registry.ts:85-92 |
| build-raster-tiles.py default theme paints og `#15803d` (diverges from registry) | TRUE | build-raster-tiles.py:48 (`#15803d`) vs registry `#0d5c2a` |
| Presets only enable layers, no styling | TRUE | presets.ts (layers: string[]); useLayerState.ts:175-179 `applyPreset` = `setEnabledLayers(preset.layers)` |

---

## The 16 dimensions

**1. Problem-fit — PASS.** Every wave maps to a verified, live-observed defect (D1–D10). Wave 1 targets the two hard breakages (proxy CQL, z-order); Waves 2–3 target fidelity. No adjacent-problem drift.

**2. Architecture correctness — CONCERN.** Three of four core fixes are sound. The proxy CQL fix is correct (the point path already proves bare-Albers CQL geometry works). The WfsLayers fix is correct and actually *understates* how dead the current high-zoom WFS path is. **The z-order helper (Wave 1.2) has a sequencing hazard:** react-map-gl's declarative `<Layer beforeId>` IS supported and stable across re-renders (verified: `node_modules/react-map-gl/dist/mapbox-legacy/components/layer.js:14-15` calls `map.moveLayer(id, beforeId)` on prop change, :57 passes `beforeId` to `addLayer`). BUT `moveLayer`/`addLayer` require the `beforeId` target layer to *already exist*. Each layer renders in its own `DataLayer` instance (CanopyMap.tsx:213-221) with independent async mount timing. A satellite that anchors `beforeId: "layer-forest-age-raster"` will throw or no-op if forest-age hasn't mounted yet, and vice-versa. The "named anchor slots" abstraction does not by itself solve cross-instance mount-order — it needs a stable always-present anchor.
   *Fix:* Anchor against the **basemap style's own layers** (which always exist at map-load), not against sibling overlay layers. Concretely: satellite inserts `beforeId = firstSymbolId` (the same anchor PmtilesLayers/WfsLayers already use, DataLayer.tsx:113/493) so it sits below labels; raster overviews and fills insert with NO beforeId (append) so they naturally stack above satellite by mount order — OR, simpler still and what the prompt hints at: give satellite a `beforeId` of the first basemap symbol and leave everything else as-is. Avoid a helper that anchors overlays to each other. If a deterministic overlay order is genuinely needed, drive it imperatively from a single owner (like `setup-layers.ts` already does for the story path) rather than from N independent declarative `<Layer beforeId>` props.

**3. Security — PASS.** No new attack surface. Proxy change is a query-string reshaping of an already-allow-listed param against a fixed LAYER_CONFIG; bbox clamping (:683-690) and Albers rounding stay. Wave 2 writes new R2 objects (public read, build-time upload) — same trust boundary as today. No secrets touched.

**4. Completeness — CONCERN.** Two silent gaps:
   - **Test fallout is unaccounted for.** Wave 2 changes the old-growth raster color from `#15803d`→`#0d5c2a`, but `src/test/audit/color-audit.test.ts` *hardcodes* `RASTER_COLORS["old-growth"] = "#15803d"` (line 88) and has a dedicated regression test asserting `expect(rasterHex).toBe("#15803d")` / `expect(vectorHex).toBe("#0d5c2a")` / `expect(distance).toBeCloseTo(41.5)` (lines 208-209, 282-284). The plan says "color-audit already guards the TS side" but does not note these assertions will FAIL and must be updated. Same for Wave 3 parks/species: `opacity-audit.test.ts:193` asserts parks effective opacity `toBeCloseTo(0.1, 3)` — the emerald-fill change breaks it.
   - **`live-health.spec.ts` does not yet assert cqlFilter layers return features** (it checks forest-age + tenure-cutblocks tile fills only). The plan says "extend e2e/monitoring to assert fish-streams + tap-deferrals return features live" — that test does not exist; treat it as new work, not an edit.
   *Fix:* Add a line item per wave: "update the audit tests that encode the old oracle values" (color-audit lines 88/208-209/259-285; opacity-audit parks block 182-199). Name the new live-health checks explicitly.

**5. Reuse vs reinvention — PASS.** Reuses `firstSymbolId` insertion (already in both PmtilesLayers and WfsLayers), the existing maplibre mock, color/opacity/zoom-handoff audits, and the registry palette as single source of truth. `beforeId` is already an established pattern (setup-layers.ts:66). The Wave 2 "generated palette" idea is the right reuse move.

**6. Simplicity / elegance — CONCERN.** The z-order "ordering helper with named anchor slots" is over-built for the actual need. The verified failure is exactly one layer rendering too high: satellite. The minimal correct fix is a single `beforeId={firstSymbolId}` on the satellite `<Layer>` (and optionally the forest-age raster). A general slot system (basemap→satellite→raster→fills→lines→symbols) implies cross-instance ordering guarantees the component model can't cheaply provide (see dim 2). Per the fix-vs-build heuristic, D1 is a *fix*: ask for the one-line version first.
   *Fix:* Scope Wave 1.2 down to "satellite (and forest-age raster overviews) insert below the basemap's first symbol layer." Defer any general slot manager unless a second concrete ordering bug appears.

**7. Failure modes & error handling — CONCERN.** The proxy fix changes the failure profile of three layers from "always errors" to "depends on GeoServer CQL parsing." Worth noting: `count=` (maxFeatures, :696/706) is preserved as a separate WFS KVP param alongside `CQL_FILTER` — that combination is legal in WFS 2.0 (count is not bbox), so the maxFeatures interaction the prompt flagged is fine. But: BBOX inside CQL with no SRS argument relies on GeoServer interpreting coords in the layer's native CRS (EPSG:3005). The point path proves this for `INTERSECTS`/`POINT`; `BBOX()` should behave identically, but this is the one piece worth a `/probe` curl before shipping rather than asserting.
   *Fix:* Wave 1.1 must include a live curl proving `CQL_FILTER=BBOX(GEOMETRY,w,s,e,n) AND (STREAM_ORDER >= 3)` returns features for fish-streams *before* the URL-builder unit test is considered authoritative. The plan claims this was done ("Fix shape proven live") — pin the exact curl + response in the PR.

**8. Data integrity / single-source-of-truth — PASS (with a caveat the plan already names).** Wave 2's "generated palette" unifies the Python theme colors with the registry — exactly the SSOT move. Caveat: until the generator exists, three places encode the palette (registry.ts match expr, build-raster-tiles.py THEMES, color-audit RASTER_COLORS). The plan addresses two; it must also update the third (color-audit).

**9. Sequencing & destructive-step safety — PASS.** Wave 2 writes new R2 objects then flips, and the old dirs are already broken (nothing working is overwritten). Wave ordering (1→2→3→4) front-loads pure-code correctness. R2 uploads are additive until verified.

**10. Dependencies / supply chain — PASS.** No new runtime deps. Python build deps (rasterio/numpy/shapely) already required by the existing script. No new npm packages.

**11. Performance / load — PASS.** Proxy change is param reshaping (no extra round-trips). WfsLayers fix *reduces* load (skips a now-useless WFS fetch for every tile-backed layer on every `moveend` — currently fetching data that renders nowhere, DataLayer.tsx:1018). Wave 2 regenerates z4–z9 for 4 classes — a one-time build cost, consistent with the existing forest-age generation. `moveLayer` on re-render (z-order) is O(1) in MapLibre.

**12. Verifiability / testability — CONCERN.** Strong existing harness (smoke, audits, dual-source-status, live-health, maplibre mock). Gaps: (a) the new live-health cqlFilter assertions don't exist yet; (b) the StrictMode "no crash, no layers for tile-backed" characterization test is described but the plan should name *which* assertion proves "no layers added" (query `map.getLayer('layer-<id>-fill')` returns undefined for a tile-backed layer after double-mount). (c) No stated test that the satellite actually sits below overlays post-fix — the live-health raster test only checks existence/visibility, not stacking order. A `getStyle().layers` index-order assertion would close this.
   *Fix:* Add explicit assertions: (1) z-order — satellite layer index < forest-age raster index in `map.getStyle().layers`; (2) WfsLayers — `getLayer('layer-cutblocks-fill') === undefined` after StrictMode double-mount.

**13. Reversibility / rollback — PASS.** Code waves revert by git. Wave 2 R2 flip is reversible by re-pointing `rasterOverviewClassUrl`/the default raster URL back, since old objects are only *added to*, not deleted, until verified. Recommend NOT deleting old R2 dirs in the same deploy that flips — keep them one release for rollback.
   *Fix (minor):* State explicitly "do not delete orphaned R2 dirs until one release after the flip verifies."

**14. Scope discipline — CONCERN.** Mostly disciplined (out-of-scope section is explicit and good). But the z-order helper (dim 6) is gold-plating relative to the verified bug, and Wave 3.8's preset `styleOverrides` is the most speculative item — it requires a new type field, threading `activePreset` through CanopyMap→DataLayer (currently only `enabledLayers`/`classFilters` flow, CanopyMap.tsx:214-221), and applying an `opacityScale` over THREE opacity sites (PMTiles fill `fill-opacity` expr :125, WFS fill :504, and the hardcoded raster `0.85` :1092/1116). The plan only mentions "fill paint." If opacityScale doesn't also scale the raster 0.85, the forest-age backdrop will visibly jump opacity at the raster→vector handoff under a preset override.
   *Fix:* Either (a) scope opacityScale to apply at all three sites (including raster), or (b) drop Wave 3.8 to a follow-up and ship the simpler per-preset wins (parks, conservancies, species, cutblocks drop) first.

**15. Operational impact — PASS.** Deploy is Netlify (edge function + static). Wave 2 adds a manual build+upload step (who runs it: Lee/build script) — already the established raster-tile workflow. `/production` gate is in Wave 4. Live-health monitoring exists and is extended.

**16. Maintainability / evolution — CONCERN.** Removing `RASTER_THEME_COLORS` and the gold theme is a clean simplification. But Wave 3.8's `styleOverrides` introduces a second styling authority (registry paint + preset override) — the very drift dim 8 warns against, now on the opacity axis. The `activePreset` is *computed* from the layer set (useLayerState.ts:93-105), so an override keyed by preset id is fragile: toggling one layer drops you out of the preset and silently reverts overrides, which may surprise users.
   *Fix:* If Wave 3.8 ships, document that overrides apply only while a preset is exactly matched, and add a test for the "toggle a layer → override clears" transition. Prefer a single styling authority: bake the per-preset opacity into a derived layer-definition rather than a parallel override map.

---

## Stress tests

### Pre-mortem (3 months out)

1. **The audit tests were the rollback trigger, not the safety net.** Wave 2 ships, CI goes red on color-audit (`#15803d` assertion) and opacity-audit (parks `0.1` assertion). Because the plan framed these audits as "already guarding," the implementer treats the red as a regression, reverts the palette change, and old-growth stays gold — the exact thing the wave existed to fix. *Should have seen:* the audits encode old oracle values; changing the palette REQUIRES editing them, and that edit is part of the change, not a failure.

2. **Satellite z-order flickers on pan.** The slot-helper anchors overlays to each other; under real async tile timing, sometimes forest-age mounts after satellite, so `moveLayer(satellite, beforeId=forest-age-raster)` no-ops (target absent) and satellite briefly covers the overlay until the next re-render fires `moveLayer` again. Intermittent, unreproducible in the single screenshot test, ships. *Should have seen:* cross-DataLayer mount order is nondeterministic; anchor only to basemap layers that always exist.

3. **fish-streams returns features in the curl but renders empty on the map.** The proxy fix works, but `STREAM_ORDER >= 3` at province scale + the 50,000 km² viewport-area guard (DataLayer.tsx:930-947, WFS-only layers) means at the zoom Lee tested, the viewport guard short-circuits to EMPTY before the fetch — the proxy was never the only gate. *Should have seen:* fish-streams is WFS-only (no tileSource), so the area guard applies; verify the test zoom is inside both `zoomRange` AND under the area cap.

### Load-bearing assumptions

1. **"`BBOX(GEOMETRY,w,s,e,n)` with bare EPSG:3005 coords parses on GeoServer."** Confidence: HIGH (the point path proves bare-Albers CQL geometry works, wfs-proxy.ts:633). Consequence if wrong: all three cqlFilter layers stay broken and the fix ships a no-op. *Resolve before implementation:* pin the live curl + response in the PR (plan claims it's proven — make it reproducible).

2. **"Rendered behavior is unaffected by removing the tile-backed WFS path."** Confidence: HIGH. Verified: WfsLayers returns null at :478 for ALL tile-backed layers today, so the high-zoom WFS detail is *already* not rendering; PMTiles (PMTILES_MAX_ZOOM=12) overzoom covers z13–18. Interactivity for tile-backed layers comes from `-tiles-fill` (CanopyMap.tsx:168-179), not the WFS `-fill`. Removing the dead fetch is safe. Consequence if wrong: lost high-zoom detail on tile-backed layers — but there is none to lose.

3. **"opacityScale can multiply the zoom-interpolated fill-opacity without fighting it."** Confidence: MEDIUM. MapLibre allows `["*", scale, ["interpolate", ...]]`, so mechanically yes. But the opacity lives in THREE places (PMTiles fill, WFS fill, hardcoded raster 0.85) and the plan names only "fill paint." Consequence if wrong: visible opacity jump at the raster→vector handoff under a preset. *Flag as unverified — resolve in Jen spec.*

4. **"The orphaned R2 black/gold per-class dirs are safe to overwrite."** Confidence: MEDIUM (rests on the empirical pixel-probe, not re-verified here). Consequence if wrong: overwriting a dir that some other code path reads. Mitigated by the additive-then-flip sequencing. Keep old dirs one release.

### Inversion

**What would make "skip the proxy fix, fix it client-side" win?** It would win if GeoServer rejected CQL `BBOX()` too (forcing post-fetch client filtering). Is that condition true? No — the point-query path proves CQL geometry predicates work against this exact endpoint. The proxy fix is the right layer.

**What would make "imperative single-owner z-order (like setup-layers.ts)" win over declarative `beforeId`?** It wins if cross-DataLayer mount order proves unreliable for declarative anchoring. Is that condition already true? **Partially yes** — DataLayers mount independently with async tile timing (dim 2). This is the one rejected-alternative whose precondition is arguably already met. If the minimal `beforeId={firstSymbolId}` (anchor to basemap, not siblings) doesn't fully resolve ordering, fall back to the imperative single-owner pattern that already exists in the codebase.

---

## Overall verdict — APPROVE WITH CHANGES

The diagnoses are unusually well-grounded: I verified every cited file:line and the plan's claims hold, including the stronger-than-stated finding that the tile-backed WFS render path is fully dead code today (so Wave 1.3 is genuinely behavior-neutral). Wave 1.1 (proxy CQL) and Wave 1.3 (WfsLayers) are correct and ready. The weaknesses are concentrated in three places: (1) the plan treats the existing audit tests as a safety net when they actually encode the *old* oracle values and will go red on the palette/parks/species changes — those test edits are part of the work, not regressions; (2) the Wave 1.2 z-order helper is over-built and has a real cross-instance mount-order hazard — scope it down to anchoring against the basemap's first symbol layer; (3) Wave 3.8 preset `styleOverrides` is the most speculative item, touches three opacity sites the plan only half-accounts for, and introduces a second styling authority keyed off a *computed* preset id. None of these are fatal; all are addressable before or during implementation.

## Prioritized must-fix list

1. **(Blocking, Wave 2/3)** Add explicit line items to update the audit tests that hardcode old oracle values: `color-audit.test.ts` lines 88, 208-209, 259-285 (old-growth `#15803d`→`#0d5c2a`, distance 41.5→~0); `opacity-audit.test.ts` lines 182-199 (parks `0.1`). Frame as required edits, not regressions.
2. **(Blocking, Wave 1.1)** Pin the live curl proving `CQL_FILTER=BBOX(GEOMETRY,...) AND (filter)` returns features for fish-streams in the PR before treating the URL-builder unit test as authoritative.
3. **(High, Wave 1.2)** Scope the z-order fix to "satellite + forest-age raster insert `beforeId={firstSymbolId}` (basemap anchor)." Drop the general cross-instance slot manager; if deterministic overlay order is later needed, use the existing imperative single-owner pattern (setup-layers.ts), not declarative sibling-to-sibling `beforeId`.
4. **(High, Wave 1.2)** Add a z-order assertion to the test net: satellite layer index < forest-age raster index in `map.getStyle().layers`.
5. **(High, Wave 3.8)** Either make `opacityScale` apply at all three opacity sites (PMTiles fill, WFS fill, raster 0.85) or defer 3.8 to a follow-up and ship the simpler preset wins first. Add a "toggle drops preset → override clears" test if it ships.
6. **(Medium, Wave 4)** The live-health cqlFilter-returns-features checks for fish-streams/tap-deferrals are NEW tests, not edits — list them as such.
7. **(Medium, Wave 1.3)** Name the StrictMode characterization assertion precisely: `getLayer('layer-<tilebacked-id>-fill') === undefined` after double-mount.
8. **(Low, Wave 2)** State explicitly: do not delete orphaned R2 dirs until one release after the flip verifies (rollback safety).
9. **(Low, Wave 1.1)** Verify fish-streams test zoom is inside `zoomRange` AND under the 50,000 km² WFS area guard (DataLayer.tsx:930-947) so an empty render isn't misread as a proxy failure.
