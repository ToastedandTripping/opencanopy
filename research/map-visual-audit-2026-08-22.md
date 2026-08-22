# OpenCanopy — /map Visual Layer Audit (22 Aug 2026)

Live screenshot audit of every public `/map` layer and preset on production (`main` @ `634f830`),
at nine views (BC z5; west Vancouver Island z7/9/11/13; Prince George z7/9/11/13), each against a
zero-layer baseline of the same view, with a network log per shot. Two independent design passes
(Jen, Fable) plus an orchestrator cross-check. 144 captures.

**Report (with images):** https://claude.ai/code/artifact/4e3b7b25-9897-4ac0-9955-6e4287d6416f
**Evidence + scripts:** `~/marvin/research/opencanopy-map-layering-comms-20260717/visual-audit-20260822/`
(findings files, `manifest.jsonl`, `coverage.json`, contact sheets, `capture.mjs`).

**Verdict.** The map is honest about its data and misleading about its meaning. Nothing is fabricated;
the screens a reader lands on say three things the project does not believe: that a third of the coast
is old growth, that everything ever cut or burned is happening now, and that "Threats" is a forest-age
map with a different name. Under that, plumbing faults make the first twenty seconds of any deep link a
default view with a chip lit and nothing drawn.

This file is the **tracking checklist**. Every finding has a stable ID, a severity, a batch, and a
status. The batches are the remediation program in `ROADMAP.md`. Update the status column here when a
batch ships; never renumber.

Severity: **B** blocker · **M** major · **m** minor · **n** note. Status: open · planned · shipped · wontfix (with reason).

---

## Corrections after review

- **Legend detail exists one click away (Lee, 22 Aug).** The legend chip is collapsed by default; the
  expanded state shows every `legendItems` label (Old Growth 250+ / Mature / Young / Harvested) plus
  class-filter toggles. F1, K2 and CH1 are therefore about the *default* state, not missing content,
  and are downgraded to minor. What the expanded state does **not** show is the layer `description`
  (where the "not official TAP deferral boundaries" caveat lives) — that is layer-panel-only — so F2
  and T2 stand.
- **Preset captures.** The first preset pass was empty because `preset=` alone restores nothing (P8).
  Presets were re-captured as explicit `layers=` lists; the preset verdicts below are from real pixels.

---

## A. Plumbing (measured)

| ID | Sev | Finding | Where | Fix | Batch | Status |
|---|---|---|---|---|---|---|
| P1 | M | Deep-link camera silently dropped: on-mount flyTo polls for the map 20×100 ms then gives up. Any load >2.2 s (cold cache, mobile, every capture) lands on the default view with `layers=` still applied. Hits every share link and the landing CTA (`/map#STORY_END_CAMERA`). | `src/hooks/useMapState.ts:160–195` | Fly on the map `load` event (react-map-gl `onLoad`) or retry until `map.loaded()` with no cap. Test: mount delay >3 s still lands on hash camera. | 0 | open |
| P8 | m | `preset=` alone restores nothing; restore is gated on `parsed.layers`. UI share links write both params and survive; hand-written/doc links do not. | `useMapState.ts:251` | `if ((parsed.layers \|\| parsed.preset) && onLayerRestore)`; resolve preset → layers. | 0 | open |
| P2 | M | Vector layers attach 14–40 s after load. With only `cutblocks` on, ~190 forest-age raster tiles (`raster/v3/forest-age` + four `raster/v2/*` class rasters) are fetched before the PMTiles header (13.7 s single-tab; median 27 s under load); first vector tile at 21 s (median 41 s). | prefetch / DataLayer ordering | Prefetch forest-age rasters only when forest-age is on; attach the requested layer's source before any prefetch; honour `fetchPriority`. | 3 | open |
| P3 | M | One PMTiles archive carries all 12 vector layers in every tile (minZoom 4, maxZoom 12). Bytes per view: z7 median **26.5 MB** (z7 tile 10.9 MB), z9 7.0 MB, z11 1.4 MB, z13 0.4 MB. Toggling Parks at z7 costs 26 MB. Root of the May "secondary layers questionable" verdict and of P2. | `opencanopy-v10.pmtiles`, tile build | One archive per layer (registry already has per-layer `tileSource.url`); drop forest-age vectors below z10 (raster covers); `--maximum-tile-bytes` + `--drop-densest-as-needed` for z≤8. Same build as the z10+ holes. | 4 | open |
| P4 | M | No vector layer renders at province z5 (0 tile reads with a 75 s window) although `zoomRange: [5,18]` on cutblocks/parks/fire-history/conservation-priority. Fire is invisible at the one zoom where fire is the story. | registry zoomRange vs paint/minzoom | Decide intent; make registry and pixels agree (`[6,18]` + "zoom in to see" chip state, or a real z5 treatment). | 2 | open |
| P5 | m | Satellite gated to ~z10+ while registry says `[0,22]`; Overview preset has no satellite at arrival zooms. | registry | `zoomRange [10,22]`; preset copy to match. | 2 | open |
| P6 | m | 7 of 18 registry layers public (`PUBLIC_LAYER_IDS`); 11 hidden since the May audit with no recorded ruling. | `registry.ts:882` | **Decision (Lee):** restore after P3, or delete from the registry. | 3 | open — awaiting ruling |
| P7 | m | Preset bar active state is a 1-level luminance difference (`bg-white/15` vs `/5`); all four pills read as lit. `computeActivePreset` is correct. | `PresetChips.tsx:49–52` | Active: `bg-emerald-500/20 text-white border-emerald-400/40` + 6 px dot; inactive `text-zinc-500 bg-transparent`. | 1 | open |

## B. Layers (design)

| ID | Sev | Finding | Fix | Batch | Status |
|---|---|---|---|---|---|
| F1 | m | Collapsed chip shows four unlabelled dots; young `#f97316` and harvested `#ef4444` are near-equal lightness at map opacity and identical under deuteranopia. Labels exist on expand (see Corrections). | Separate young from harvested by value/second channel (young → `#d97706` at 0.45; harvested adds hatch or a 0.8 `#7f1d1d` outline at z≥10). Default-expanded legend on desktop is a product choice — see Q3. | 2 | open |
| F2 | M | Dark-green "old growth" is 60–70 % of land pixels at the CTA landing view; the reader just read 0.3 %. VRI age ≥250 vs Price/Holt/Daust big-tree — both true, nothing on the map surface reconciles them. The caveat lives in `description`, which the legend never shows. | Legend label → "Stands 250+ yr (VRI age)"; on story arrival, one line under the legend: "VRI counts all stands over 250 years; 'large old-growth trees' (0.3 %) are a subset." | 1 | open |
| F3 | m | "No data" (E&N private grant), "no forest" (alpine), "tile dropped" (z10+ holes) and towns are one grey. | Private-land mask from TANTALIS crown-grant (E&N ~800k ha), cross-hatched `#3f3f46` at 0.25, legend "Private forest land — no public inventory". | 4 | open |
| F4 | n | z9→z10 raster→vector handoff is a texture change, not a meaning change. Acceptable. | — | — | wontfix (acceptable) |
| T1 | B | At z10+ `tap-deferrals` is a gold scribble: `#fbbf24` 1.5 px outline at 0.9 on every VRI polygon (1–20 ha) buries the green fill; reads as the warning hue shared with conservation-priority and fire, and as fragmentation. | Outline width `["interpolate",["linear"],["zoom"],8,0,10,0.6,13,1.2]` at 0.5 — better, dissolve adjacent polygons at build time and edge only the stand-group perimeter. Swatch = green fill, not gold ring. | 2 (paint) / 4 (dissolve) | open |
| T2 | M | Layer named "Old Growth Forest" shows 7–29 % of land; story's last number is 0.3 %. | Rename → "Stands 250+ yr (VRI)". Big-tree subset layer if `SITE_INDEX` survives in tiles (else data item). | 1 (copy) / 4 (data) | open |
| T3 | m | Interior empty at z9+ (genuine: plateau pine/spruce) but screen is bare base + lit chip → reads as broken. | Per-chip empty state from debounced `queryRenderedFeatures` on `idle`: "No 250+ yr stands in view". Applies to all vector layers (H3, CP3, K3). | 3 | open |
| C1 | M | "Boundary-dominant, fill 0.04" is true only at z≥11; at z7–z9 1–1.6 px outlines on 3–12 px polygons coalesce into solid red. Same ground says "everything logged" at z9 and "barely anything" at z11. No age grading in static view: a 1950 block = a 2024 block. | Outline width ramp `5,0.3·8,0.6·10,1.0·12,2.2`, opacity `5,0.5·9,0.7·12,0.9`; below z10 fill-only with opacity keyed to `DISTURBANCE_START_DATE` (`1950,0.15·2000,0.35·2025,0.7`) — the scrub path already computes this; make it default. Legend "Cutblock, 1950–2025 (brighter = more recent)". | 2 | open |
| C2 | M | Cutblocks `#dc2626` on forest-age harvested `#ef4444` (ΔE≈6) in Threats and Fire+Logging; the Wave-3.9 de-collision does not hold at z≤9. | Cutblock edge → white `#ffffff` 1.2 px at 0.85; legend swatch an outlined square. | 2 | open |
| C3 | m | 2–6 km rectilinear "cutblocks" (tenure/planning boundaries) pass the <2000 ha filter; read as a 30 km² clearcut. | Filter on status/open-admin-date presence, or cap 500 ha; else legend note. | 4 | open |
| C4 | n | Province z5 blank with chip lit — P4. | — | 2 | (P4) |
| H1 | M | 1917 and 2023 fires are the same flat amber; overlaps invisible; interior z9 is 25 % one colour → "a quarter of the land is burnt, now". | Opacity by `FIRE_YEAR` (`1917,0.12·1980,0.25·2010,0.45·2025,0.65`) + `#fbbf24` outline at 0.6; legend "Fire perimeter, 1917–2025 (brighter = more recent)". | 2 | open |
| H2 | M | Fire `#f59e0b`, conservation-priority `#eab308`, old-growth outline `#fbbf24` — one lane at map opacity. | Resolve via CP1 (move priority to violet) + T1 (drop outline). | 2 | open |
| H3 | n | Coast near-empty at every zoom — true, not broken; same empty-state need. | T3 | 3 | (T3) |
| K1 | M | Parks are a green wash in the old-growth lane; under forest-age they vanish. The protection story (Strathcona's old growth is inside a park, Clayoquot's is not) is invisible. `fill-outline-color` is an imperceptible hairline. | Parks are an edge when stacked: white outline `7,1·10,1.5·13,2` at 0.85, dashed `[2,1]`, fill 0.08, via `style.outline`. Standalone fill may stay. | 2 | open |
| K2 | m | Swatch `#34d399` is 2–3× the lightness of the rendered fill. | Pre-multiply swatch against base (≈`#2f6b52`) or raise fill and rely on K1 edge. | 1 | open |
| K3 | n | 0 % at z5 (P4); 0 % at both z13 views is genuine. | — | — | (P4/T3) |
| CP1 | M | Gold means three things (TAP priority, old-growth outline, fire). Protection renders as gold blobs under gold lacework; "priority is a 2.6 Mha subset of old growth" is unreadable. | Policy designation, not forest type → cool hue: `#a78bfa` fill 0.35 + `#c4b5fd` 1 px outline. Protection then reads green / violet / white edge. | 2 | open |
| CP2 | m | Three names for two concepts; "TAP" sits on the wrong layer (`tap-deferrals` is VRI old growth). | Rename ids/labels consistently (`old-growth-250`, `tap-priority`) with a hash alias for the old id. | 1 | open |
| CP3 | n | Interior empties by z13 — genuine; empty-state need. | T3 | 3 | (T3) |
| S1 | M | z9→z11 jump-cut from dark base to daylight imagery; every fill ramp was tuned for `#1a1a1a`. Overview at z11+ reads "lots of logging, little forest". | `zoomRange [10,22]`; when satellite is on, desaturate (`raster-saturation -0.6`, `raster-brightness-max 0.7`) or one 0.35 black dim layer between imagery and overlays. | 2 | open |
| S2 | m | Satellite sits in the legend as a dataset with a colour dot. | Base-map switch in the controls cluster. | 1 | open |
| S3 | n | 0 % at z5–z9 is the gate (P5), not missing tiles. | — | — | (P5) |

## C. Presets

| ID | Sev | Finding | Fix | Batch | Status |
|---|---|---|---|---|---|
| PR1 | B | **Threats** is pixel-identical to forest-age alone within 1 pt in all nine views (red on red, C2; cutblocks thinned past z10). Reader: "BC is red wherever it has trees." | C2. | 2 | open |
| PR2 | M | Threats shows the past, not the future — no approved-not-yet-cut distinction. | Split paint on FTEN status if in tiles; else rename "Logging" — or this is Phase D (FOM proposed-logging layer, probed GO). **Decision (Lee), Q2.** | 2 / D | open |
| PR3 | B | **Fire + Logging**: young `#f97316` / fire `#f59e0b` / harvested `#ef4444` / cutblock `#dc2626` collapse into one orange-red (interior z9 worst); registry array order draws forest-age *over* fire. | H1 + C2; add `zRank` to `LayerDefinition` (rasters 0, fills 10, outlines 20, lines 30) and sort on it. | 2 | open |
| PR4 | M | **Protection**: the one legal protection (parks) is the faintest member; gold outline + gold fill read as one system → "all this old growth is protected." Near-empty in the interior with no empty state. | K1 + CP1 + T1; rank by legal strength; rename "Old growth + protection" or remove old growth. **Decision (Lee), Q4.** | 2 | open |
| PR5 | M | **Overview**: forest-age alone at z5–z9 (P5, K1); at z11+ green on green imagery (S1). | K1 + S1; make copy and zoomRange agree, or drop satellite from the preset. **Decision (Lee), Q5.** | 2 | open |

## D. Chrome (desktop 1440×900 only)

| ID | Sev | Finding | Fix | Batch | Status |
|---|---|---|---|---|---|
| CH1 | m | Collapsed chip truncates at 180 px ("Forest Age Class…", "Old Growth Forest (250…"); labels are one click away (see Corrections). | `max-w` 280 px at md+; shorter registry labels. Default-expanded on desktop / first enable is Q3. | 1 | open |
| CH2 | m | Attribution <2:1 over the gold lattice; scale bar clipped at left edge. | `bg-black/60` strip, `text-zinc-300`; 8 px inset. | 1 | open |
| CH3 | n | Layer-count badge has no label. | `title="N layers on"`. | 1 | open |

## E. Not covered — needs its own pass

| ID | Item | Batch |
|---|---|---|
| X1 | Mobile: preset-bar overflow, chip stacking with the timeline, 44 px targets, P1/P2 on cellular. | 5 |
| X2 | Interaction: popups, hover, Timeline scrub, Select / Visible-area / Watershed. | 5 |
| X3 | The 11 non-public layers (after P6 ruling and P3). | 5 |
| X4 | Light base styles. | 5 |

## Questions only Lee can answer

| # | Question | Blocks |
|---|---|---|
| Q1 | P6 — restore the 11 hidden layers once P3 is fixed, or delete them from the registry? | Batch 3/4 scope |
| Q2 | PR2 — should "Threats" become "Logging" (history), or wait for Phase D's FOM proposed-logging layer to make it a real threat map? | Batch 2 copy |
| Q3 | Legend default state — keep collapsed-by-default (current, deliberate?) or expanded on desktop / first enable? | F1, CH1 |
| Q4 | Protection preset — rename "Old growth + protection", or remove old growth from it? | PR4 |
| Q5 | Overview preset — keep satellite (from z10) or drop it and make it "Forest age + parks"? | PR5 |
| Q6 | Old-growth subset layer (T2 data) — is `SITE_INDEX` in the VRI extract? If not, is a big-tree layer worth a data pull? | Batch 4 |

---

## Method

Playwright headless Chromium (SwiftShader), fresh context per shot, direct `goto` with `layers=`
in the hash, `popstate` dispatched after the canvas mounts (because of P1), wait for first PMTiles
tile read (≤75 s), network-idle twice, 4 s. Coverage = map-area pixels (chrome masked) differing
from the zero-layer baseline by >24/255 in any channel. Zero-layer baseline = load `layers=parks`,
click "Remove Provincial Parks". The `__opencanopy_map` handle is dev-only in production.

**What this audit cannot see:** mobile, interaction, the hidden layers, light styles, real-device
latency (SwiftShader is slower than a laptop and faster than a phone on cellular).

**Three things only a human in a real browser can confirm:** P1 on a phone over cellular; the
first-twenty-seconds blank (P2) on a laptop, and for how long; that Threats and Fire + Logging look as
undifferentiated on a good display as they do here.
