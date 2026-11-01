# Skeptic verification: map-visual findings (2026-10-01)

Verifier: independent skeptic subagent. Method: own headless Chromium (Playwright, node) against https://opencanopy.ca, fresh context per run, plus source read of /home/leesalo/.local/share/marvin/worktrees/opencanopy/session-f8d7c3 (read-only). Auditor's screenshots/numbers NOT trusted. Default verdict when not reproduced: could-not-reproduce.

Evidence dir: /home/leesalo/marvin/research/opencanopy-ui-perf-audit-20261001/verify/map-visual-evidence/

## Verdicts (appended as reached)

### F-16 (desktop province view never loads vector data) — CONFIRMED (severity: see final line)
- Method: own probe (`scripts/probe.mjs`), fresh context, direct goto, NO popstate, NO interaction, 45 s, MapLibre instance read by walking React fibers up from `.maplibregl-map` (not the auditor's DevTools-hook method). Data `data/f16.jsonl`, logs `data/b1_*.log`.
- Desktop 1440x900 `#lat=54&lng=-125.5&z=5&layers=fire-history`: 3/3 GPU runs + 1/1 SwiftShader run: performance marks `create` only (no MapLibre `load`/`fullLoad` mark), 0 `.pmtiles` requests in 45 s, 160 raster 404s, `map.loaded()` true, `isStyleLoaded()` true, source `opencanopy` absent, 0 tile layers. Returning desktop visitor (localStorage `["fire-history"]`, bare /map): identical (no load mark, 0 pmtiles, 160 404s).
- Phone 390x844, same hash and the returning case: 2/2 `load` at 4.4-5.9 s, 8 `.pmtiles` requests, 6 raster 404s, 12 tile layers attached.
- Screenshot `shots/f16_desktop_z5_fire_run2.png`: legend shows "Fire History / Fire Perimeter", map is bare basemap.
- Code: `DataLayer.tsx:420-427` registers `initSource` on `load` when `isStyleLoaded()` is false at mount; the `load` event never comes on desktop. Mechanism claim (last settled tiles are 404s, which schedule no repaint) is consistent with the 160-vs-6 404 split; not independently instrumented.

### F-17 (page holds a null map handle) — CONFIRMED, P0 stands
- Method: own script `scripts/f17.mjs`; besides behaviour, it reads the React fiber `ref.current` of every forwardRef above `.maplibregl-map` (direct observation of the handle, not inferred). Data `data/f17.jsonl`, logs `data/b2_*.log`.
- Handle: in every fresh load the inner react-map-gl ref (depth 1) is a MapRef while the CanopyMap ref the page reads (depth 3) is `null` (desktop search x2, share x2, camera-only x3). After one Overview chip tap it becomes a MapRef.
- Search, fresh desktop: "Tofino Municipality" selected, 6 s later still z5 at -125.5,54, scale "100 km" (2/2). Same steps after one preset tap: z12 at -125.90,49.15, scale "1 km" (1/1).
- Share, fresh: wheel-zoomed to z7.41 (desktop) / z6.32 (phone); `location.hash` still empty; Copy shareable link wrote `https://opencanopy.ca/map` (2/2, desktop and phone).
- Camera-only `#lat=49.15&lng=-125.9&z=12`, sampled 20 s, no popstate: 0/3 landed (desktop 2, phone 1), z5 throughout.
- Code matches: `CanopyMap.tsx:68` `useImperativeHandle(ref, () => mapRef.current!)` with no deps; `page.tsx:419-428` search and `useMapState.ts:304-308` share both read that ref.
- Phone search not run (my script could not click the phone search input; the handle is null on phone anyway).

### F-02 (raster overviews above labels and data at z4-9) — CONFIRMED on mechanism; severity overstated -> P1
- Live style order (own fiber-walk handle, `scripts/f02.mjs`, `data/f02.jsonl`), 3/3 loads (phone Logging z8 interior, desktop Logging z8 interior, desktop Fire + Logging z9 VI), all after `load` + `fullLoad`: first symbol "Ocean labels" = index 39, data tile layers 27-38, all six raster overviews 50-55. Exactly as claimed.
- Rendering trap found while verifying: the map runs 3D terrain, so MapLibre renders fill/line/raster layers into cached render-to-texture stacks. A plain in-session `moveLayer` A/B shows no pixel change (0.02-0.09% of pixels; `shots/f02b_phone_logging_z8__triptych.png`) because the cache is keyed on tile coords and source revision, not on layer order. A valid A/B needs a terrain reset after the move (`scripts/f02b.mjs`, `data/f02b.jsonl`).
- Valid A/B, phone, Prince George z8 (`shots/f02c_phone_logging_z8__triptych.png`, `shots/f02c_phone_firelogging_z8__triptych.png`). Comparison: the same pixels with the rasters at opacity 0 (data alone). Mean |RGB diff|, live order vs rasters moved under the data:
  - Logging, at cutblock-outline pixels: 36.3 vs 6.6.
  - Fire + Logging, at fire pixels: 28.7 vs 12.5.
- Severity: the data is not gone. Cutblock outlines still read faintly, because the harvested raster class is red too. The fire perimeters, though, merge into the young-forest orange. That is a real legibility loss at the zooms readers arrive at, and the fix is cheap. But "Logging and Fire + Logging show forest age" overstates what the screen shows. P1, and still sequence it before any Batch-2 paint work, as the auditor says.
- Cause claim (`DataLayer.tsx:1088-1094` sets `rasterBeforeId` only when `isStyleLoaded()` is true at a `styledata` event): consistent with the order still wrong after `fullLoad`. Not instrumented further.

### F-18 (timeline opens at 1917 over fires to 1950) — CONFIRMED live; P0 stands (not a new discovery)
- Own probe `scripts/f18.mjs`, phone, `#lat=53.9&lng=-122.75&z=9&layers=fire-history`. I wrapped `setGlobalStateProperty` on the live map before opening the timeline. Data `data/f18.jsonl`. Shots: `shots/f18_phone_pg_z9__0-closed.png` (timeline closed) and `__open_1s.png`, `__open_4s.png`, `__open_10s.png` (after opening).
- At 1 s, 4 s and 10 s after "Open timeline":
  - The readout says "0 ha burned through 1917".
  - MapLibre global state is `{currentYear: 1950}`.
  - The fire filter is `FIRE_YEAR <= global-state.currentYear`.
  - `queryRenderedFeatures` returns 200 fire features, the latest from 1950.
  - `setGlobalStateProperty` is called 0 times, although `isStyleLoaded()` reads true at each sample.
- This breaks CHARTER non-goal 3 ("a visual may not outrun or overstate the data") at the first frame a reader sees.
- Already known: this is 09-01 refresh R1-02, carried as owed work in `.claude/handoff.md` ("One relay for the three DataLayer public-path bugs before Batch 2"). Live confirmation is the only new part.

### F-13 (shared-link cameras miss on fresh loads) — CONFIRMED, worse than reported; the landing CTA is affected
- Own runs (`scripts/f17.mjs camera`, `data/f17.jsonl` labels `f13_*`, logs `data/b4_*.log`): fresh contexts, no popstate, 20 s sampled, 3 browsers in parallel. 6 of 12 loads never left z5:
  - Fire + Logging z9 link: desktop missed 3/4, phone missed 1/4.
  - The landing CTA's own link `#lat=49.3800&lng=-125.8600&z=8.0&layers=forest-age`: desktop missed 2/4.
- Correlation with F-17 is exact. In every miss the page-level ref stayed `null` for all 20 s. In every hit it became a MapRef by 1.0-1.3 s.
- This refutes the auditor's "landing CTA landed in all 5 checked loads". The CTA hand-off is a Lee ruling in DECISIONS.md (2026-08-21: "the zoom into the old-growth pocket is /map's job, via the CTA deep-link"), so a CTA that strands the reader at the province view about half the time is P0, not P1. It is the same defect and the same fix as F-17.

### Layout probe (F-03, F-04, F-05, F-24, F-01): own DOM geometry and hit tests
- `scripts/layout.mjs` (`data/layout.jsonl`): fresh context, 12 s settle, element boxes and `elementFromPoint` at each centre. Shots `shots/layout_*.png`; phone crop `shots/crop_phone_firelogging_bottom.png`.

### F-03 (desktop share button clipped) — CONFIRMED, P1 stands
- Desktop 1440x900, 3/3 configurations (bare, CTA, Fire + Logging): the scroller is 834-941 px wide and its content is 863-970 px, so 29 px of the row is hidden.
- "Copy shareable link" (28x44) sits at x=1130 (bare, CTA) or x=1184 (Fire + Logging), only 8 px from the scroller's visible edge. The hit test at its centre returns the map canvas.
- The bar visibly ends after "Watershed" with no link icon (`shots/f16_desktop_z5_fire_run2.png`).
- Mitigations exist: Tab focus or a trackpad side-scroll reaches it. They do not change the verdict.

### F-04 (phone: active preset off-screen, controls hidden, bug flag over chip 3) — CONFIRMED, P1 stands
- Phone 390x844 on Fire + Logging: the pressed chip (`aria-pressed=true`) is at x=396 and off-screen. Select, Timeline, Watershed and Copy link are at x=550-947, also off-screen. The scroller clips at x=376.
- "Report a bug" (44x44 at 339,753) sits over the bar's row (chips y=761-805) and covers the right part of "Old Growth + Parks", which is also the only visual cue that the row scrolls.
- One caveat: the auditor's "nothing on screen says which view is on" is too strong. The legend does list the three active layers.

### F-05 (phone legend capped at 25vh hides Young/Harvested) — CONFIRMED on fact; severity overstated -> P2
- Phone, Fire + Logging: the legend box is y=537-748 (211 px = 25vh), with scrollHeight 257 against clientHeight 209 and `scrollbar-width: none`.
- The "Young (<80 yr)" and "Harvested" rows (y=756 and 772) hit-test to the preset bar. The crop shows the legend cut at "Mature".
- Why P2: the hidden rows are one scroll away, and the legend collapses per layer. It is a comprehension cost on one preset, not a break.

### F-24 (phone touch targets) — PARTIALLY CONFIRMED: counts exact, WCAG framing overstated -> P2
- Phone, Fire + Logging: 24 visible interactive elements. 17 are under 44 px; 13 are under 24 px. That matches the auditor exactly.
  - The 13: legend class filters 200x13 at a 16-17 px pitch, legend rows 174x17, remove × 20x20, three attribution links 10-21 px tall.
  - The four MapLibre controls are 29x29.
- Against WCAG 2.2 SC 2.5.8, the size count alone does not establish failures:
  - The attribution links are inline text, which SC 2.5.8 exempts.
  - The × and the legend rows have more than 24 px clearance, so they pass on the spacing exception.
  - The real AA failure is the four stacked 13 px class-filter rows, where a mis-tap filters the map.
- 44 px is Apple HIG and WCAG AAA guidance, not AA.
- Side observation (this is F-06, not re-verified as a finding): on phone, MapLibre "Zoom in"/"Zoom out" hit-test to the search bar.

### F-08 (PMTiles source not ready 15 s after load is abandoned for the session) — CONFIRMED deterministically; P1 stands, with the frequency caveat
- Own method, not starved rendering. `scripts/f08.mjs` holds every `.pmtiles` request until t=25 s with Playwright `page.route` (phone, GPU). `load` fires about 3 s in, so the header arrives about 22 s after `load`. Data `data/f08.jsonl`, logs `data/b6_*.log`.
- At 18.1 s, six console warnings fire: `[OpenCanopy] PMTiles source for forest-age|cutblocks|fire-history|old-growth-250|parks|tap-priority failed to load within 15s`. The visitor had enabled only fire-history and cutblocks.
- Once the header is released (25 s), the source exists but no tile layer is ever added (0 tile layers, 0 rendered features through 69 s), and no tile request follows the header. Abandoned for the session, as claimed.
- The toast at 20-22 s reads "Couldn't reach BC data — Forest Age Classes, Cutblocks, Fire History, Old-Growth Stands (VRI 250+ yr), Provincial Parks, Conservation Priority Areas". It names four layers that are off and blames BC for our own timer. By 30 s it is gone.
- Control run (no hold): 12 tile layers and 283k rendered features by 21 s.
- Caveat: my hold is synthetic. The auditor's own GPU and Lighthouse-mobile runs did not trip the 15 s window naturally, so how often it happens on real phones is unmeasured. P1 because the failure is permanent and the copy is false whenever it does trigger.

### F-14 (no loading state; error state is a 2 px line) — CONFIRMED, P1 stands (CHARTER done-1 "honest status states instead of silent blanks")
- Code:
  - `DataLayer.tsx:1144` returns before any `setLayerLoading` for tile-backed layers, and every public data layer is tile-backed.
  - `LoadingBar` opacity is driven only by `status === "loading"`.
  - `MapLegend.tsx:232-236` renders `LayerStatusBadge` only when `!expanded`.
- Live (`data/f08.jsonl`): in the forced outage (every `.pmtiles` aborted), the legend text stays "Fire History Fire Perimeter Cutblocks Cutblock (boundary)" in every sample from 3 s to 49 s, identical to the working control. No "BC data unavailable" badge ever renders. The only persistent signal is the `border-amber-400/40` left border on 2 rows. The toast appears only at about 19.4 s, when the 15 s timer fires, not when the abort happens, and has gone by 30 s.
- `shots/f08_triptych_outage_delay_control.png`: outage | delayed | working. The first two are a lit legend over a blank map.
- Side note: in the outage and control runs the deep-link camera stayed at z5 (no popstate), which is another F-13/F-17 occurrence.

### F-01 (first visit is an empty basemap) — PARTIALLY CONFIRMED: fact true, but a deliberate past choice of Lee's -> P2, a decision for Lee
- Live (`data/layout.jsonl`, `layout_phone_bare`, `layout_desktop_bare`): no chip has `aria-pressed=true`, there is no legend region, and the layer badge is empty.
- Not an accident. Commit 48406d3 (2026-06-02, author Lee Salo): "Disable Old Growth and Provincial Park by default and bump the localStorage key ... so returning visitors pick up the new default selection". It is not in DECISIONS.md, but it was deliberate, so this is a product decision, not a P1 defect.
- Interaction the auditor missed: the proposed fix (defaultEnabled forest-age + parks) would, until F-16 ships, show every desktop first visitor a lit "Provincial Parks" legend over no parks, because parks is vector-only at z5 and `load` never fires there. F-16 has to land first.

### F-09 (share card / meta describe a surface that does not exist) — CONFIRMED, P1 stands
- `curl https://opencanopy.ca/map`:
  - meta description: "...species at risk, and logging threats using real-time BC government data".
  - og:description, og:image:alt and twitter:description all say "species at risk".
- Live og:image downloaded (`shots/og_live.png`): "17 data layers", swatches "Deferrals" and "Fish streams", and "Old growth, logging, carbon, and species at risk".
- `PUBLIC_LAYER_IDS` (`registry.ts:893-901`) = 6 data layers + satellite. Species-at-risk is not public, and neither is any fish-streams layer.
- CHARTER non-goal 2 fixes the public surface at 7 layers + satellite. The 09-01 refresh already corrected "17 layers" in the README.

### F-10 (Discover/tooltip numbers nothing derives) — CONFIRMED, P1 stands for the Eldred hectares; the others are weaker
- `src/data/hotspots.ts:27,32` "1,131 hectares of old growth", "cedars exceeding 1,200 years", and `stats.oldGrowthHa: 1131`, rendered as "1,131 ha old growth" by `HotSpotPanel.tsx:39-42`. Also `:66` "96m Sitka spruce", and the `registry.ts:546` tooltip "2.6 million hectares".
- `grep` over scripts/, src/ and docs/ finds no derivation of 1131 and no test pinning it. All four strings are in the live chunks (`1,131 hectares` and `96m Sitka` in `2xscwfumjupwg.js`; `2.6 million hectares` in `1_a0-shix3-hf.js`).
- DECISIONS 2026-09-02, per Lee: "A figure that cannot be derived is not shown."
- Weighting:
  - The 1,131 ha is a dataset-type claim, and it uses the "old growth" wording Batch 1 retired. That is a clear violation.
  - The 96 m height and the 2.6M ha TAP figure are external published facts. The 2.6M ha is also a hover-only `title` that no phone shows. Citing these two is a smaller fix than deriving them.

### F-12 (100vh on iOS Safari) — COULD NOT REPRODUCE (code fact true) -> P2 pending one device check
- Code fact verified: `page.tsx:693` uses `h-screen`. The /map viewport export (`map/layout.tsx:20-24`) has no `viewportFit`, and `dvh`, `svh` and `safe-area` appear nowhere in the map shell. The bottom cluster is `absolute bottom-8` inside the 100vh `<main>`.
- No WebKit browser is installed (`~/.cache/ms-playwright` has Chromium only), and Chromium emulation has no dynamic toolbar, so the claimed overlap could not be observed. The mechanism is well known and plausible. Even the auditor rated confidence medium.

### F-15 (red-green CVD collapses the forest-age palette) — PARTIALLY CONFIRMED: protanopia number reproduced; "collapse" overstated; already in the parked colour re-spine -> P2, decision for Lee
- Independent CIEDE2000 + Machado-2009 (severity 1.0) implementation (`scripts/cvd.py`, `data/cvd_palette.json`). Palette from `forest-age-palette.json`, composited at 0.85 over #222222. Old growth vs harvested measures 60.0 normal, 23.2 deuteranopia, 7.3 protanopia. 7.3 matches the auditor's theoretical floor.
- Young vs harvested is 9.5 under deuteranopia, the weakest pair for the commonest CVD.
- Overstated: deuteranopia, the commonest form, keeps old growth vs harvested at 23.2, which is clearly separable. ΔE00 7.3 is weak at map scale but not "one olive field".
- The paint/colour work is already sequenced: ROADMAP "Batch 2 PAINT RE-SPINE (... H1/H2 fire recency, CP1 priority to violet ...)" and Parking Lot Phase C "color/threat re-spine". The forest-age palette change is Lee's call, as the auditor says, and it touches the story.

### F-20 (popups undo the Batch 1 relabel, speak in codes) — CONFIRMED, P1 stands
- Live tap (`scripts/f20.mjs`, `data/f20.jsonl`):
  - Phone, forest-age at VI z11: "Classification | Old Growth | Age | 330 | Species | YC". The legend on the same screen says "Stands 250+ yr (VRI)", with the VRI-vs-0.3% caveat.
  - Desktop, Fire + Logging at Prince George z11: "Mature Second Growth | Age 94 | Species SX".
- Source: `CLASS_DISPLAY_NAMES` in `src/lib/taxonomy/forest-age.ts:57-62`.
- "Mature Second Growth" also asserts a prior harvest that a VRI age alone cannot show.
- Not verified: the × overlap detail and the multi-layer omission.

### T1 (Old Growth + Parks at z10+ reads as a gold lattice) — CONFIRMED visually; already scheduled -> P2
- `shots/t1_desktop_protection_vi_z11__view.png` (desktop, VI z11, old-growth-250 + parks + tap-priority): a gold outline on every stand plus gold priority fills dominate the frame. `registry.ts:397` outline `#fbbf24` 1.5 px @0.9 unchanged.
- Already in ROADMAP's confirmed sequence: "Batch 2 PAINT RE-SPINE (... T1 old-growth outline ramp ...)". Nothing new to schedule. It is paint polish, not broken or false.
- Same frame shows the parked z10+ tile seam: a straight horizontal edge in the parks fill at y≈355.

### F-16 addendum (extension runs, `data/f16b.jsonl`, logs `data/b8_*.log`) — severity line: P0 stands
- A 5 px mouse drag at 20 s ends it at once: `load` fires at 20.48 s, the PMTiles header is requested at 20.50 s, and 12 tile layers are attached. A hover/mouse-move at 20 s does nothing; still no `load` at 40 s. "Until the visitor touches the map" is accurate, if "touch" means pan or zoom.
- Broader than the province-wide shared link. Desktop bare /map, a desktop Fire + Logging z9 link, and the desktop CTA link (`forest-age,parks` at z8) all stayed at z5 when the F-13/F-17 camera miss struck. None of them fired `load` in 30-40 s, and none issued a single `.pmtiles` request (72-160 raster 404s).
- Taken together on desktop: every visit that sits at the default view without a pan, including the roughly 50% of deep links whose camera misses, shows a lit legend over no vector data. That is the screen stating something false, so P0.

## Summary table

| ID | Auditor | Verdict | Corrected | One-line reason |
|---|---|---|---|---|
| F-17 | P0 | confirmed | P0 | The page-level ref is `null` in fresh loads (read from the React fiber). Search 0/2, share wrote `/map` 2/2, camera-only 0/3. |
| F-16 | P0 | confirmed | P0 | Desktop: no `load`, 0 `.pmtiles` in 30-45 s across 8 configurations. Phone fine. A 5 px drag fixes it, a hover does not. |
| F-13 | P1 | confirmed (worse) | P0 | 6/12 fresh deep links stuck at z5, including the landing CTA 2/4. Same null ref as F-17. |
| F-18 | P0 | confirmed | P0 | Readout "1917" against global state 1950 and rendered fires to 1950. Already owed as R1-02 in handoff.md. |
| F-02 | P0 | confirmed | P1 | Order confirmed (rasters 50-55 above labels at 39 and data at 27-38). A terrain-reset A/B shows data attenuated, not erased. |
| F-08 | P1 | confirmed | P1 | Header held to 25 s: abandoned for the session, toast blames BC and lists 4 layers that are off. Real-world frequency unmeasured. |
| F-14 | P1 | confirmed | P1 | Outage legend is identical to working. No badge while rows are expanded. LoadingBar never driven for tile-backed layers. |
| F-03 | P1 | confirmed | P1 | Desktop Copy link sits 8 px inside the scroller edge; its centre hit-tests to the canvas, 3/3. |
| F-04 | P1 | confirmed | P1 | Phone: active chip at x=396 off-screen, 6 of 9 bar controls off-screen, bug flag over chip 3. |
| F-09 | P1 | confirmed | P1 | Live OG card: "17 data layers", "Fish streams", "Deferrals". Meta: "species at risk", "real-time". |
| F-10 | P1 | confirmed | P1 | 1,131 ha shown, derived nowhere. Breaks the 2026-09-02 ruling. The 96 m and 2.6M ha figures are weaker cases (external facts). |
| F-20 | P1 | confirmed | P1 | Popup says "Old Growth" and "Mature Second Growth", with species codes YC and SX. |
| F-05 | P1 | confirmed | P2 | Young/Harvested rows clipped at 25vh, but reachable by scroll; the legend is collapsible. |
| F-24 | P1 | partially-confirmed | P2 | Counts match exactly (17/24 under 44, 13 under 24). Only the class-filter rows clearly fail WCAG 2.5.8 AA. |
| F-15 | P1 | partially-confirmed | P2 | Protanopia ΔE00 7.3 reproduced. Deuteranopia stays 23.2. Already in the Batch 2 / Phase C colour work. Lee's decision. |
| T1 | P1 | confirmed | P2 | Gold lattice reproduced. Already in ROADMAP Batch 2 paint re-spine (T1 outline ramp). |
| F-01 | P1 | partially-confirmed | P2 | Empty first visit is deliberate (Lee's commit 48406d3, 2026-06-02). The proposed default would hit F-16 on desktop. |
| F-12 | P1 | could-not-reproduce | P2 | `h-screen` is in the code, but there is no WebKit here. Needs one iPhone check. |
