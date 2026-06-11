# Plan Critic — Round 2 (Layer Fidelity, 2026-06-10)

Fresh second-pass review. Round 1 (`-critic.md`) verdicted APPROVE WITH CHANGES; the
author folded all findings in. This pass does **not** re-confirm round 1 — it hunts for
NEW and SECOND-ORDER issues the revisions introduced, verified against the actual code.

Method: read the real render site (`CanopyMap.tsx:213-221`, not `page.tsx` — the plan's
"map shell" is CanopyMap), the DataLayer raster paths and imperative effects, the
react-map-gl 8.1.0 → `@vis.gl/react-maplibre` `Layer` source, and MapLibre 5.21.0's
`Style.addLayer`/`moveLayer` internals. Test line numbers opened and matched.

---

## Focus area 1 — Wave 1.2 z-order rewrite — **CONCERN (two blocking sub-issues)**

The revised Wave 1.2 has two moving parts: (a) declarative raster `<Layer>`s gain
`beforeId = firstSymbolId`; (b) the map shell renders raster-source DataLayers (satellite)
before vector DataLayers. I verified the load-bearing mechanics end to end. The *direction*
of the fix is right and the round-1 hazard (sibling-to-sibling anchoring) is gone — but the
revision introduces two new, concrete problems.

**Finding 1a — `firstSymbolId` is not available at declarative render time, and the
declarative path has no re-render trigger when it becomes available. (BLOCKING)**

- The render site is `CanopyMap.tsx:213-221`, iterating `LAYER_REGISTRY_AVAILABLE` (NOT
  `enabledLayers` — every registered layer always mounts a `<DataLayer>` with `visible`
  toggled). `DataLayer` calls `useMap()` at :867, so `map` *is* in render scope. So far so good.
- But `firstSymbolId` is derived from `mapInstance.getStyle().layers.find(type==='symbol')`
  (the imperative paths do this at DataLayer.tsx:113 and :493, **inside effects**, i.e. after
  style load). There is **no static constant** for it: the basemap is a *remote* style
  (MapTiler `backdrop-dark` or OpenFreeMap `dark`, mapConfig.ts:14-16) whose symbol-layer ids
  are unknown until the style JSON loads.
- On the *first* DataLayer render the style is typically not yet loaded, so a declaratively
  computed `firstSymbolId` is `undefined`. The `@vis.gl/react-maplibre` `Layer.createLayer`
  (layer.js:51-59) only adds the layer when `map.style._loaded` is true and calls
  `map.addLayer(options, props.beforeId)`. With `beforeId === undefined` the raster is
  **appended topmost**.
- The retry path does NOT save you. `Layer` subscribes to `styledata` and force-updates
  *itself* (layer.js:67-81), but it re-runs `updateLayer` with the **same stale
  `props.beforeId`** that the parent `DataLayer` passed. `updateLayer` only calls
  `map.moveLayer(id, beforeId)` when `beforeId !== prevProps.beforeId` (layer.js:14-16).
  Since `DataLayer` itself does not re-render on `styledata` (I read the whole body
  866-1156 — there is no `styledata`/`load` subscription that bumps state), `props.beforeId`
  stays `undefined` forever. **Result: satellite stays topmost — the exact bug Wave 1.2
  exists to kill, shipped as a no-op.** This is pre-mortem #2 from round 1 re-manifesting in
  a new disguise: not sibling-anchor races, but "the declarative anchor is computed before
  the style loads and never recomputed."
- *Fix (pick one):*
  (i) **Preferred — imperative single-owner**, exactly the fallback the plan already names
  (`setup-layers.ts` computes `firstSymbolId` once in the load handler at :96 and adds layers
  in deterministic order). For the interactive map, the satellite raster is one layer; insert
  it imperatively below `firstSymbolId` in a small effect that waits for style load (mirror
  the PMTiles `isStyleLoaded`/`sourcedata` gating already in this file). This removes the
  declarative timing problem entirely.
  (ii) If staying declarative: force `DataLayer` to recompute `firstSymbolId` after style
  load — subscribe to the map's `styledata`/`load` once and bump a state value, then derive
  `firstSymbolId` in render. Memoize so it only changes once (avoid a `moveLayer` storm on
  every `styledata`). This is strictly more code than (i) for the same result.

**Finding 1b — the "satellite renders first" change is a registry/iteration-order change,
and the plan does not say *which* array is reordered. (CONCERN, low-risk but specify it)**

- The render maps over `LAYER_REGISTRY_AVAILABLE` in array order. In the registry today
  forest-age is **first** (registry.ts:54) and satellite is near the **end** (:722). To make
  satellite mount first the implementer must either reorder the `LAYER_REGISTRY` array or
  sort the `.map()` source in CanopyMap by `source.type === "raster"`.
- Good news (verified, answers focus area 4): reordering the *render iteration* is decoupled
  from everything stateful. URL state serializes `enabledLayers.join(",")` (useMapState.ts:121),
  which is the *state* array order, untouched by the render order. Mutual-exclusivity
  de-confliction (useLayerState.ts:21-23,169+) operates on `enabledLayers`, also untouched.
  LayerPanel renders `LAYER_REGISTRY.filter(category===cat)` grouped by category
  (LayerPanel.tsx:256-258), not raw array order. The audit tests use `.find(id)`/
  `.filter(pred)` (proxy-consistency, zoom-handoff), never positional. So **no exclusivity or
  URL-state test breaks** from reordering — confirmed.
- BUT: prefer sorting the **`.map()` in CanopyMap** (e.g. raster sources first), not
  reordering `LAYER_REGISTRY` itself — `getDefaultLayers()` (registry.ts:852-853) and any
  future consumer iterate the registry, and silently changing physical array order is a
  latent surprise. *Fix: specify "stable-sort the CanopyMap render list so raster-source
  layers come first; do not reorder the registry array."*

**Finding 1c — the load-bearing "which insert lands on top" question, answered precisely.**
MapLibre 5.21.0 `Style.addLayer(layer, before)`: `s = before ? _order.indexOf(before) :
_order.length; _order.splice(s, 0, id)` (maplibre-gl.js, verified). Inserting at an existing
`before` puts the new layer **at** that index, pushing `before` up one. So when two layers
both anchor `beforeId=firstSymbol` and satellite inserts **first**, satellite takes the
`firstSymbol` slot; forest-age-raster then inserts at the (now shifted) `firstSymbol` slot,
landing **above** satellite. ⇒ satellite below forest-age. **This is the desired result and
the plan's "render rasters first" ordering produces it correctly** — *conditional on 1a being
fixed so the anchor is valid at insert time.* Note the plan's part (a) says forest-age raster
overviews also get `beforeId=firstSymbolId`; that is consistent and required for 1c to hold
(if forest-age-raster appended with no beforeId it would also sit above satellite, which
happens to be fine, but then the two rasters' relative order is mount-order-dependent — keep
both anchored for determinism).

**One more, non-blocking but worth a line:** a non-existent `beforeId` does **not throw**.
`Style.addLayer` *fires an error event* ("Cannot add layer X before non-existing layer Y")
and returns without adding (verified in maplibre-gl.js). `Layer.createLayer` has no try/catch
and doesn't need one — but the failure is *silent* (layer simply absent) plus a console error
event. So a stale/undefined anchor degrades to "raster missing or topmost," never a crash.
That's why 1a is a correctness bug, not a stability bug — and why a screenshot test that only
checks *existence* (like live-health does) would not catch it. The plan's proposed
`getStyle().layers` index-order assertion (satellite index < forest-age raster index) is the
right test and DOES catch it — keep it, and make it the gate for Wave 1.2.

---

## Focus area 2 — Wave 3.8 opacityScale at three sites — **CONCERN (underspecified, one new gap)**

Verified how each of the three named opacity sites actually behaves on a prop change, and
whether a scale change re-creates layers (it does not — see below).

**Site (a) PMTiles fill — the forest-age backdrop, the main target.** Opacity is NOT a
create-time constant you can just wrap. It is governed by the *merged filter+opacity effect*
(DataLayer.tsx:318-389), which is the single authority and re-runs on its deps
(`layer.style.paint`, `classFilters`, `yearFilter`, …). It has **two** opacity branches:
- timeline-inactive (:363-388): `restoreOpacity = layer.style.paint["fill-opacity"]` →
  `setPaintProperty(fillId,"fill-opacity",restoreOpacity)` (:375-376). To scale, wrap this in
  `["*", scale, restoreOpacity]` (or scale each stop) AND add `opacityScale` to the dep array.
- timeline-**active** (:334-360): `ageOpacity = buildAgeGradedOpacity(...)` →
  `setPaintProperty(fillId,"fill-opacity",ageOpacity)` (:345-346). **The plan never mentions
  this branch.** If a preset override is active while the timeline is open, the age-graded
  opacity is applied *unscaled*, so forest-age visibly jumps opacity when the user
  opens/closes the timeline under a preset. **NEW second-order gap** the round-1 review did
  not name (round 1 only flagged the raster 0.85 site).
- *Fix:* scale BOTH branches (multiply `ageOpacity` and `restoreOpacity` by `opacityScale`),
  and add `opacityScale` to the effect's dependency array (:389). The plan's "wrap stops:
  stop × scale" only covers the static-expression sub-case.

**Site (b) WFS fill — there is no post-creation opacity write today.** For WFS fill layers,
`fill-opacity` is set once at layer creation (:504, from `layer.style.paint["fill-opacity"]`)
and the visibility effect (:736-796) toggles *layout* `visibility`, never paint. So a
`opacityScale` prop change after creation has **no effect** unless a NEW `setPaintProperty`
call is added — none exists. The plan phrases this as "WfsLayers paint opacity" as if it's a
single existing knob; for fill it must be *built*. (For WFS *line* and *circle*, the
visibility effect at :758 / :783 does re-apply opacity, but does not multiply by scale and
does not depend on a scale prop — those also need the scale folded in and added to deps.)
*Fix:* name explicitly that Wave 3.8 must ADD a WFS-fill opacity-update effect keyed on
`opacityScale` (today none), and augment the line/circle visibility-effect opacity writes to
multiply by scale.

**Site (c) raster 0.85 — straightforward**, the declarative `raster-opacity` (:1092,:1116)
is computed each render from `visible && showDefault ? 0.85 : 0`; multiply the constant by
`opacityScale` (passed as a prop) and react-map-gl's `updateLayer` will `setPaintProperty`
it (layer.js:30-42, paint-diffed by key). This site is the easy one and the plan handles it.

**Does a scale change re-create layers? No (verified).** PMTiles/WFS init effects guard with
`if (getLayer(...)) return` and their dep arrays don't include any scale prop, so changing
`opacityScale` won't re-run creation. That's the *good* news (no flash from teardown) but
it's also *why* sites (a) and (b) require explicit paint-update wiring — there is no
re-creation to pick up the new value implicitly.

**Net:** the three-site intent is correct, but as written the plan accounts for ~1.5 of the
3 sites. Two need new/augmented `setPaintProperty` wiring (WFS fill has none; PMTiles
age-graded branch is unaddressed), and all three need `opacityScale` added to the relevant
dependency arrays or threaded as a `<Layer>` prop. This is the most likely place for a
"works in the demo, jumps in the corner case" bug. Round-1 must-fix #5 already offered the
escape hatch (defer 3.8 to a follow-up) — that remains the lowest-risk option; if it ships
this wave, the spec must enumerate all four code points (a-inactive, a-active, b-fill-new,
b-line/circle, c).

---

## Focus area 3 — cited oracle/test line numbers — **PASS (all confirmed exact)**

- `color-audit.test.ts:88` — `"old-growth": "#15803d"` in `RASTER_COLORS`. ✔
- `:208-209` — `expect(rasterHex).toBe("#15803d")` / `expect(vectorHex).toBe("#0d5c2a")`. ✔
- `:259-285` — the `"documents old-growth raster/vector mismatch as known issue"` test:
  `expect(distance).toBeCloseTo(41.5, 0)` (:282), luminance `0.159`/`0.079` (:283-284), and
  note it uses **hardcoded** `parseHex("#15803d")` (:275) independent of the `RASTER_COLORS`
  map — so the plan's stated range 259-285 is correct: updating only line 88 leaves this test
  red. The plan captures both. ✔ (Also: the in-range assertion at :215 `distance > 20` flips
  once old-growth converges to `#0d5c2a` — distance → 0 — so that line must change too; it's
  inside the 200-218 block the plan already lists as 208-209's neighborhood. Note it
  explicitly.)
- `opacity-audit.test.ts:182-199` — `"documents parks effective opacity"`:
  `expect(effectiveOpacity!).toBeCloseTo(0.1, 3)` (:193) and the `fill-outline-color` truthy
  check (:198-202). The emerald-fill parks change breaks :193. ✔

All numbers are real and say what the plan claims. No drift between plan citations and code.

---

## Focus area 4 — new internal contradictions from the revisions — **PASS (no contradiction; one clarification)**

- "Render rasters first" vs existing `enabledLayers` ordering: **no contradiction.** The
  render iterates `LAYER_REGISTRY_AVAILABLE`, not `enabledLayers`; reorder is decoupled from
  state (proven above). Layer-exclusivity (useLayerState) and URL-state
  (`enabledLayers.join(",")`) are both untouched by render order. The URL-state/exclusivity
  tests do not break.
- Satellite-in-enabledLayers-only-when-toggled: irrelevant to the reorder, because the
  `<DataLayer>` for satellite is *always mounted* (visible=false when off). The reorder
  changes mount/insert order, not presence.
- One clarification (not a contradiction): the plan's phrase "raster-source DataLayers
  (satellite)" correctly excludes forest-age, whose `source.type` is `"wfs"`
  (registry.ts:60) and whose raster overview renders through the WFS branch's declarative
  `<Layer>`s (:1087,:1111). So "render rasters first" moves only satellite ahead; forest-age
  stays in the vector group. Combined with finding 1c that is exactly what yields
  satellite-below-forest-age. Consistent — just make sure the implementer doesn't mistake
  forest-age for a raster-source layer when writing the sort predicate (sort on
  `source.type === "raster"`, which selects satellite only).

---

## New pre-mortem (revisions only)

1. **Wave 1.2 ships as a silent no-op.** `firstSymbolId` is computed declaratively before the
   remote basemap style loads → `undefined` → satellite appended topmost; DataLayer never
   re-renders on `styledata` so the anchor never updates. Screenshot test passes if it only
   checks existence; the `getStyle().layers` index assertion is the only thing that catches
   it. *Cause:* declarative anchor depends on async style load with no recompute. (Finding 1a.)
2. **Forest-age opacity jumps when the timeline opens under a preset.** opacityScale is
   applied to the static fill-opacity expression but not to the age-graded branch
   (DataLayer.tsx:346), so toggling the timeline on/off changes the backdrop opacity under an
   active preset override. (Focus area 2.)
3. **WFS-fill preset override appears to do nothing.** opacityScale is threaded as a prop and
   scales raster + PMTiles fill, but WFS fill has no post-creation paint write, so any
   WFS-fill layer under a preset keeps its registry opacity. Looks like a partial bug to a
   tester comparing layers. (Focus area 2, site b.)

## Load-bearing assumptions (new)

- **"Declarative `beforeId` is sufficient for the satellite z-fix."** Confidence: LOW given
  the async-style-load timing (1a). Consequence if wrong: the whole wave no-ops. Resolve by
  going imperative-single-owner (the plan's own named fallback) OR adding a styledata-driven
  recompute. This is the round-2 must-fix.
- **"opacityScale has one knob per site."** Confidence: LOW for PMTiles (two branches) and
  WFS fill (zero existing knobs). Consequence: opacity discontinuities at timeline/handoff
  boundaries. Resolve in the Jen spec by enumerating all code points.

## Inversion (revised)

Round 1 already found that the imperative single-owner alternative's precondition (async
cross-instance mount timing) is *partially already true*. Round 2 strengthens that: for the
declarative path, the precondition is **fully true** — `firstSymbolId` is unknowable until
the remote style loads and the declarative component never recomputes it. So the rejected
alternative (imperative, like `setup-layers.ts`) now *wins on the merits*, not just as a
fallback. Recommend adopting it for the satellite anchor outright.

---

## Overall verdict — **APPROVE WITH CHANGES**

The revisions fixed round 1's sibling-anchor hazard and correctly reframed the test edits as
work-not-regressions; the oracle citations are exact. But the rewrite traded one z-order
hazard for a subtler one: a **declarative** `beforeId={firstSymbolId}` cannot be satisfied at
first render (remote style not loaded) and the declarative `DataLayer` never recomputes the
anchor, so Wave 1.2 risks shipping as a silent no-op. And Wave 3.8's opacityScale, while
correctly scoped to "three sites" in prose, under-specifies two of them in code (PMTiles
age-graded branch unaddressed; WFS fill has no existing paint write to scale). Neither is
fatal, both are precisely fixable, and the rest of the plan (proxy CQL, WfsLayers, Wave 2
palette + oracle updates, parks/conservancies/species, cutblocks drop) is sound and ready.

## Prioritized must-fix list (round 2)

1. **(BLOCKING, Wave 1.2)** Resolve the `firstSymbolId`-before-style-load gap. Preferred: add
   the satellite anchor **imperatively** in an effect that waits for style load (mirror
   `setup-layers.ts:96`/the existing PMTiles `isStyleLoaded` gating), inserting satellite
   below `firstSymbolId`. If kept declarative, force a one-time DataLayer recompute on
   `styledata`/`load` and memoize it. A declarative `beforeId` computed in the render body
   will be `undefined` on first paint and never updated.
2. **(BLOCKING, Wave 1.2 verification)** Keep the `map.getStyle().layers` index-order
   assertion (satellite index < forest-age-raster index) as the gate — it is the ONLY check
   that catches the no-op failure mode (existence/screenshot checks do not). Make it run in CI.
3. **(High, Wave 3.8)** If 3.8 ships this wave, enumerate ALL opacity code points in the Jen
   spec and implement each: PMTiles fill *both* branches (static :376 AND age-graded :346),
   WFS fill (ADD a paint-update effect — none exists), WFS line/circle (:758/:783, scale +
   add dep), raster constant (:1092/:1116). Add `opacityScale` to each effect's dependency
   array. Otherwise defer 3.8 to a follow-up (round-1 must-fix #5) and ship the simpler preset
   wins.
4. **(Low, Wave 1.2)** Specify that the "render rasters first" reorder is a **stable sort of
   the CanopyMap `.map()` list on `source.type === "raster"`**, not a reordering of the
   `LAYER_REGISTRY` array (avoids a latent surprise for `getDefaultLayers()` and other
   registry consumers). Confirmed safe either way for exclusivity/URL-state, but the sort is
   the cleaner seam.
5. **(Low, Wave 2)** color-audit line 215 (`expect(distance).toBeGreaterThan(20)`) also flips
   once old-growth converges (distance → ~0); fold it into the same oracle edit as 208-209.
   The plan's "259-285" range covers the standalone test but call out :215 inside the 200-218
   block too.

All round-1 must-fixes were verified folded in; the above are strictly new/second-order.

---

# Round 3 — Final Convergence Check (Layer Fidelity, 2026-06-10)

Narrow scope: verify ONLY the two re-revised sections against the actual code,
hunting for anything the round-2 rewrites newly broke. Round-1/round-2 findings
are settled and not re-litigated. Method: read the live PmtilesLayers/WfsLayers
imperative effects, the satellite/raster declarative branches, the merged
filter+opacity effect, CanopyMap's render site + style wiring, and the actual
installed `maplibre-gl@5.21.0` `Style.addLayer` source. All cited line numbers
re-opened against the current file.

## Area 1 — Wave 1.2 (imperative satellite, pattern-cloned from PmtilesLayers) — **PASS**

**(Pattern clone is sound.)** PmtilesLayers (DataLayer.tsx:64-271) is the proven
shape: gate on `isStyleLoaded()` (:251) else `on("load", initSource)` (:254-255);
add source + layers in an effect; cleanup removes the load/sourcedata listeners
(:257-262, :265-270) and does NOT remove layers on unmount (:269 — "layers persist
across re-renders"). Visibility is a separate effect toggling layout/paint (:273-301),
never teardown. A satellite clone built on this shape inherits: rapid toggling flips
`raster-opacity` via `setPaintProperty` (the plan's stated approach), no add/remove
churn, no flash. Confirmed safe parity. Satellite registry (registry.ts:722-742):
`source.type: "raster"`, `opacity: 1`, ids `layer-satellite` / `source-satellite`.

**(a) Style-switch wipe is a non-issue here.** `mapStyle` is the static literal
`MAP_STYLES.dark` (CanopyMap.tsx:191) — no state variable, no basemap toggle UI.
Grep across `src/` finds zero runtime `setStyle` calls in the app (only the test
mock's `_setStyleLoaded`). So no style switch can wipe imperative layers on the
`/map` route. StoryMap (StoryMap.tsx:244) is a *separate* `<Map>` instance on the
`/` route with its own style — it cannot contaminate the `/map` instance's
`getStyle().layers`. Satellite is therefore no worse than the existing imperative
PMTiles/WFS layers on this axis; in fact there is no axis to be worse on.

**(b) Anchor candidate set verified.** Every imperative AND declarative DATA-overlay
layer id in DataLayer.tsx is `layer-`-prefixed: PMTiles `layer-${id}-tiles-{fill,
outline,line}` (:132/:149/:184); WFS `layer-${id}-{fill,outline,line,cluster,
cluster-count,circle,loading}` (:512-656); declarative rasters `layer-${id}`,
`layer-${id}-raster`, `layer-${id}-raster-${cls}` (:1044/:1088/:1112). Sources use
the `source-` prefix (not layers — correctly irrelevant to a layer-id anchor).
**Two non-`layer-` declarative overlays exist and ARE mounted in the `/map` shell**
as CanopyMap children (map/page.tsx:503-508): DrawTool (`draw-preview-*`,
`draw-selection-*`, DrawTool.tsx:262-294) and WatershedOverlay (`watershed-boundary-*`,
WatershedOverlay.tsx:31-39). These append topmost (no `beforeId`) and SHOULD sit
above everything (selection rect, watershed boundary are UI overlays). Because they
are not `layer-`-prefixed they are correctly excluded as anchor candidates, and
satellite ends up below them too — which is the desired result. No anchor hazard.

**(c) Splice semantics verified against the actual installed source.**
`maplibre-gl@5.21.0` `Style.addLayer(layerObject, before)` (maplibre-gl-dev.js:60479):
`const index = before ? this._order.indexOf(before) : this._order.length;
this._order.splice(index, 0, id)` (:60505-60510). Inserting AT the `before`-index
pushes `before` up one. **Satellite-mounts-first case:** anchor falls back to
`firstSymbolId`; later overlays (PMTiles/WFS) compute their OWN `firstSymbolId`
anchor in their own effects (:113, :493) and insert at the same slot → they land at
the now-shifted `firstSymbolId` index, i.e. ABOVE satellite (lower `_order` index =
drawn first = underneath). **Satellite-mounts-after-overlays case:** anchor = first
`layer-*` overlay; satellite inserts below it. Both cases yield satellite-under-overlays,
**regardless of toggle order** — exactly the property Wave 1.2 needs. Explicit splice
statement: *a later insert at the same anchor lands above an earlier insert at that
anchor.* Also confirmed (:60506-60508): a non-existent `before` does NOT throw — it
fires an ErrorEvent and returns without adding, so a bad anchor degrades to
"satellite absent + console error," never a crash. This is why the `getStyle().layers`
index assertion (plan line 124-127) is the correct gate: existence/screenshot checks
miss a silent no-op; an index-order assertion catches both "topmost" and "absent."

Round-2 must-fix #1 (go imperative) and #2 (keep the index assertion as CI gate) are
folded (plan lines 99-127). Must-fix #4 (stable-sort vs registry reorder) is now MOOT —
the imperative anchor makes mount/render order irrelevant (plan lines 117-118), so the
reorder the round-2 critic was scoping no longer exists. Nothing the rewrite introduced
is broken.

## Area 2 — Wave 3.8 (enumerated opacity code points) — **PASS**

Every cited opacity write re-opened and confirmed exact in the current file:
- **:346** — PMTiles age-graded branch `setPaintProperty(fillId, "fill-opacity", ageOpacity)` (timeline-active). ✔
- **:376** — PMTiles static-restore branch `setPaintProperty(fillId, "fill-opacity", restoreOpacity)` (timeline-inactive). ✔ (both branches of the single-authority merged effect :318-389, dep array :389)
- **:758** — WFS line `setPaintProperty(lineId, "line-opacity", …)` in the visibility effect. ✔
- **:783** — WFS circle `setPaintProperty(circleId, "circle-opacity", …)`. ✔
- **:1092 / :1116** — declarative raster overview `raster-opacity` (default + per-class). ✔
- **WFS fill has NO post-creation opacity write** — confirmed: fill-opacity is set once at creation (:504) and the visibility effect uses `setLayoutProperty(fillId, "visibility", …)` (:747/:751), never paint. So Wave 3.8 must ADD a fill paint effect — exactly what the plan says (line 175-177). ✔

**Completeness sweep — no `/map`-scope opacity write missed.** `grep setPaintProperty`
+ `grep -opacity` across DataLayer.tsx surfaces every site. All are accounted for by the
plan's enumeration EXCEPT one, which I verified is correctly out of scope:
- **:1047** `"raster-opacity": targetOpacity` is the SATELLITE declarative raster
  layer (the `source.type === "raster"` branch, :1034-1052), with `targetOpacity =
  visible ? (layer.style.opacity ?? 0.7) : 0` (:882). It is NOT a preset
  `styleOverrides` target (the only scale target is forest-age, the D9 backdrop —
  presets.ts confirms Overview/Threats/Ecology scale forest-age, never satellite),
  AND Wave 1.2 rewrites this exact branch out of existence (satellite becomes
  imperative with its own opacity effect). So its omission from the Wave 3.8 scale
  enumeration is correct, not a gap.
- The remaining opacity writes in the repo (`src/lib/story/visibility.ts`,
  `setup-layers.ts`, `StoryMap.tsx`) belong to the **story map** — a separate Map
  instance on the `/` route with no preset/opacityScale concept. Out of scope for
  Wave 3.8 (interactive `/map` only). No cross-instance leakage.

Round-2 must-fix #3 (enumerate all opacity code points: PMTiles both branches, WFS
fill ADD, WFS line/circle, raster constants, each with `opacityScale` in deps) is
folded verbatim into plan lines 164-186, including the defer-3.8 escape hatch (line
181-182). The enumeration is now complete and the line numbers are exact.

## Verdicts

- **Area 1 (Wave 1.2 imperative satellite):** PASS
- **Area 2 (Wave 3.8 opacity enumeration):** PASS

## Overall verdict — **APPROVE**

The round-2 rewrites are clean. The imperative satellite correctly clones the proven
PmtilesLayers shape; the anchor logic is collision-free (all data overlays are
`layer-`-prefixed; DrawTool/Watershed UI overlays are correctly non-candidates and
stay on top); the splice semantics are verified against the actual installed
maplibre-gl@5.21.0 and produce satellite-under-overlays in both mount orders; there
is no runtime style switch to wipe imperative layers on `/map`. The Wave 3.8 opacity
enumeration is exact and complete for the interactive-map scope — the single
additional write site found (:1047) is satellite, correctly excluded (not a scale
target and replaced by Wave 1.2), and the story-map opacity writes are a separate
instance out of scope. No new breakage introduced by the rewrites.

## Must-fix list (round 3, blocking only)

None.

### Notes (advisory, non-blocking)
- When the implementer writes the satellite anchor, exclude satellite's own
  `layer-satellite` id from the candidate scan (the plan already says this) — and
  note that DrawTool/Watershed (`draw-*`, `watershed-*`) are intentionally NOT anchor
  candidates and stay topmost; don't "fix" them.
- The Wave 1.2 CI index assertion should be phrased as "satellite index < index of
  every other `layer-*` entry," which also fails-closed if satellite is silently
  absent (bad anchor → ErrorEvent, no layer) — that failure mode is the whole reason
  the assertion exists; keep it as the gate, not a screenshot existence check.
