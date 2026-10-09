# Over-paint accuracy investigation (2026-10-08)

## 0. Context read
- Pipeline: `scripts/build-year-overlays.py` rasterizes at 1024x501 equirect over BC_BOUNDS (-139.5,48,-114,60.5): pixel 0.0249 deg ~ 1.6-1.8 km E-W x 2.77 km N-S, ~450-490 ha per pixel at 50-54N. `all_touched=True`. Undated + pre-1950 blocks baked into every frame at (127,29,29,120). Mercator y-resample is order-0 nearest. Fire frames 768x376, same method.
- Display (`src/lib/story/setup-layers.ts`): MapLibre `image` sources stretched to OVERLAY_BOUNDS, `raster` layer, no `raster-resampling` set (default linear). MapLibre 5.21 has no `raster-color`, so no pixel-value expression decode is possible natively.
- Requirements already written (do not reinvent): plan `glowing-dazzling-brooks.md` C5 + S1-lite: "area-true per-year frames, undated blocks excluded"; S1 item: "Rasterize finely without all_touched, block-average, alpha proportional to covered fraction"; guard: 2025 frame's area-weighted total within +-15% of source totals; per-year totals reconcile with scrub tables within 2%; area semantics = dissolved unique area first recorded per year. S0b interim exception: coarse frames sunset 21 days after S0b release. SYNTHESIS item 7: 2025 frame paints 32.75M ha vs 6.52M ha data footprint; 1950 frame 14.2M ha for <1M ha undated; fire 41M vs 22.1M.
- Jen X spec (`x-intro-jen-spec.md`): province cameras z3.3 phone / z4.35 desktop; overlay fades .45->0 over z6-z7 "2.7 km pixels go blocky past z6"; CPU canvas pre-pass over interim PNGs (explicitly not a WebGL shader); Q1 notes interim frames paint ~5x.
- DECISIONS pin: "The GFW decode-shader endgame stays behind the pre-committed scroll-story Phase-3 gate" (year-encoded raster + custom WebGL shader).
- /map cutblocks vector: PMTiles `-Z 4 -z 12 --drop-densest-as-needed -M 5000000 --low-detail=11 --no-tiny-polygon-reduction` (`scripts/pipeline/build-tiles-chunked.sh:26-36`); registry layer draws a 1 px outline at z5 (`src/lib/layers/registry.ts` cutblocks style.outline.width).
- Scrub table `src/data/scrub/cutblocks-scrub.json`: total 5,888,477.44 ha, areaCap 2000, cumulativeNorm[76].
## 1. Measurement: painted vs stated area
### 1.1 Shipped PNGs vs scrub-stated area (script: scripts/png_area.py, output: out/png_area.txt)
Per-pixel ground area from Mercator-spaced row edges (frames are Mercator-resampled). "Painted" = alpha>0. Undated pixels identified by exact colour (127,29,29,120).

| frame | painted px | painted ha | of which dated colour | undated colour | scrub states (total x cumulativeNorm) | dated-colour / scrub | all painted / scrub |
|---|---|---|---|---|---|---|---|
| cutblocks 1950 | 29,176 | 14.23M | 0 | 14.23M | 0 | - | (1.12M ha undated in data) |
| cutblocks 1990 | 30,580 | 14.89M | 1.08M | 13.80M | 0.096M | 11.3x | 155x |
| cutblocks 2010 | 55,593 | 27.02M | 21.83M | 5.19M | 2.833M | 7.7x | 9.5x |
| cutblocks 2025 | 67,640 | 32.75M | 30.32M | 2.43M | 5.888M | 5.1x | 5.6x |
| fire 1950 | 18,404 | 16.29M | | | 6.109M | 2.7x | |
| fire 1990 | 31,663 | 26.26M | | | 10.438M | 2.5x | |
| fire 2010 | 36,068 | 29.72M | | | 11.894M | 2.5x | |
| fire 2025 | 51,679 | 41.20M | | | 22.089M | 1.9x | |

Reproduces the audit's 32.75M (SYNTHESIS item 7) exactly. The ratio is NOT a constant 5x: it is worst early (11x in 1990, when blocks are sparse) and falls as blocks fill pixels (5x by 2025). Fire is 2-2.7x because fires are big relative to the pixel. Undated pixels shrink over time only because dated colour paints over them.

### 1.2 Regions (scripts/regions.py, out/regions.json). Boxes snapped to whole 1024-grid cells (~50 km).
Dense: Vancouver Island, Nimpkish (-126.949..-126.252, 49.996..50.420), 234,029 ha. Sparse: Fort Nelson (-122.716..-121.869, 58.379..58.803), 231,400 ha.
Truth = shapely unary_union of source polygons (dated 1950-Y, cap 2,000 ha) clipped to box, area in BC Albers (EPSG:3005).

| | dense 2010 | dense 2025 | sparse 2010 | sparse 2025 |
|---|---|---|---|---|
| truth union ha | 30,178 | 49,327 | 1,399 | 1,418 |
| shipped all_touched (dated colour) | 6.38x | 4.37x | 14.6x | 17.2x |
| + undated baseline painted on top (ha) | 12,783 | 1,477 | 17,979 | 15,981 |
| touched 1024 px / median coverage of touched px | 383 / 9.8% | 436 / 18.8% | 46 / 2.9% | 49 / 2.7% |

Over-paint is density-dependent: ~4x where logging is dense, ~17x (plus ~11x more from undated) where it is sparse. The sparse north looks as logged as the coast.

## 2. Causes breakdown
### 2.2 Cutblock cause ladder (out/cut_causes.json). Replica matches shipped 1990/2010/2025 PNGs with 0 mismatched pixels.

| step (M ha) | 1990 | 2010 | 2025 |
|---|---|---|---|
| scrub table (sum PLANNED_GROSS_BLOCK_AREA, dated, cap) | 0.096 | 2.833 | 5.888 |
| sum of polygon areas | 0.096 | 2.892 | 5.936 |
| dissolved union (16x supersample, centre-sampled) | 0.096 | 2.829 | 5.788 |
| 1024 grid, centre-sampled (all_touched=False) | 0.090 | 2.798 | 5.772 |
| 1024 grid, all_touched=True | 1.097 | 21.835 | 30.328 |
| + Mercator order-0 resample | 1.085 | 21.829 | 30.323 |
| + undated baseline where no dated paint | +13.802 | +5.192 | +2.427 |
| = shipped PNG painted | 14.887 | 27.022 | 32.750 |

Attribution, 2025 frame (32.75M painted vs 5.79M union = 5.66x):
- all_touched on 1024 px: x5.24 (30.33/5.79). This is the whole story. Pixel ~470 ha vs median block 16.2 ha (p10 2.1, p90 68.9, mean 32.3; out/cut_rows.npy): a 16 ha block lights 1-4 whole pixels = 470-1,900 ha.
- Undated baseline: +2.43M ha visible (+42% of truth) from 0.96M ha of undated union (1.12M attr). In the 1950/1990 frames it is 13.8M painted for 0.96M ha, 14.3x.
- Pixel quantization alone (centre-sampled, same grid): -0.3%. Resolution is NOT the problem; all_touched is.
- Mercator order-0 resample: -0.02% (negligible).
- Sum vs union: the scrub sum exceeds the dissolved union by 1.7% in 2025 (overlapping/re-harvested blocks), within C5's 2% reconciliation only just.
- Raising resolution with all_touched kept: 4096 wide still paints 16.46M = 2.84x. Higher resolution alone does not fix it.
- Display smoothing: not measured (sandbox cannot render MapLibre). Linear filtering conserves mean alpha to first order, so it adds no area; it does widen the visible edge of every mark by about one screen pixel when upscaled (z>~4.5). Estimate, not measurement.

### 2.1 Fire cause ladder (scripts/measure.py + scripts/causes.py; out/fire_causes.json)
My replica of the shipped pipeline (768x376 all_touched + the repo's own resample_to_mercator, imported from scripts/build-year-overlays.py) matches public/raster/fire-by-year/{1990,2010,2025}.png with 0 mismatched pixels, so the decomposition below is of the shipped frames, not an approximation.

| step (fire, cumulative 2025) | M ha | factor vs previous |
|---|---|---|
| scrub table (sum of FIRE_SIZE_HECTARES) | 22.09 | - |
| sum of polygon areas (spherical) | 21.99 | 0.995 |
| dissolved union (16384x8016 centre-sampled, ~100x170 m cells) | 19.11 | 0.87 (re-burns counted twice by the sum) |
| 1024-grid centre-sampled (all_touched=False) | 19.04 | 0.997 |
| 768-grid all_touched=True (shipped) | 41.07 | 2.15 |
| + Mercator order-0 row resample | 41.20 | 1.003 |
| shipped PNG | 41.20 | exact |

Fire is 2.15x over its union, entirely all_touched; median fire polygon 44.5 ha, mean 888 ha. Note the scrub figure itself is a SUM that exceeds the dissolved union by 16% (re-burns), so even an area-true picture will paint less than the caption says (the honest direction).

## 3. Representation options
### 3.1 Pin check for option (d)
DECISIONS pins "The GFW decode-shader endgame" behind the Phase-3 gate. The gate memo (/home/leesalo/marvin/state/opencanopy-scrub-gate-memo.md) defines that path as the "WebGL year-decode path"; its fallback "3-ALT" is pre-rendered frames. A CPU decode (canvas getImageData loop, then MapLibre CanvasSource, which exists in maplibre-gl 5.21: node_modules/maplibre-gl/src/source/canvas_source.ts, or updateImage with a blob URL) uses no shader and is not that path; Jen's spec already uses a CPU canvas pre-pass on the same reasoning (x-intro-jen-spec.md item 1). MapLibre 5.21 has no raster-color, so a pure style-expression decode of pixel values is impossible. Reading: (d)-with-CPU-decode is outside the pin, but it does reuse the "year-encoded raster" idea the pin's rationale names, so it is worth one line to Lee rather than an assumption.


Evaluation summary (numbers in section 4):
- (a) Fractional-coverage alpha (S1-lite as written). Area error +0.6% to +1.8% (dense and sparse boxes, 8-bit). Province by construction equals the dissolved union. Legibility: weak where logging is thin. In 2025 a third of logged area sits in cells under 25% covered, in 1990 two-thirds, and the sparse box's median cell is 2.7% covered (alpha ~.02: invisible). Descent: 1024 cells go blocky past ~z6 (Jen spec already fades .45->0 over z6-z7). Build: smallest change (supersample + block average + drop all_touched in build-year-overlays.py), one ~20-40 min run. Ships 76 frames per dataset.
- (b) Higher resolution / tile pyramid. Resolution without dropping all_touched does not fix it (4096 still 2.8x). Resolution WITH fractional coverage improves legibility (median coverage 15% at 1024, 22% at 2048, 37% at 4096) and holds the descent to ~z7. Per-year frames at 4096 would be ~0.5 MB each (36+ MB for 76 years): not viable as frames, only as a single year-encoded image (see e). A z4-z10 per-year raster pyramid is prohibitively large; a year-encoded pyramid is the GFW design, which needs per-tile decode (possible on CPU via addProtocol, but that is the pinned endgame in all but the shader).
- (c) Vector PMTiles + global-state year filter (already wired on /map: src/lib/timeline/filter-expressions.ts). Measured geometry error: z4 +45%/+17%, z5 -11%/-12%, z6 -18%/-27%, z7 -15%/-8%, z8 -6%/-3%, z9 <=2%, z10 ~0 (dense/sparse). Wrong in both directions at province zoom, and heavy: one z4 tile over the dense box decodes to 183,716 features / 37 MB, z5 137k / 29 MB (out/vt_dense.log). Right answer from z8 down; wrong answer above it. On /map the 1 px outline (registry.ts) also over-paints at z5 by roughly a cell per block (estimate).
- (d) Year-encoded raster, decoded at runtime without a shader: viable (CPU canvas loop + CanvasSource/updateImage; MapLibre 5.21 has no raster-color, so no expression decode). Outside the Phase-3 pin by the memo's definition (section 3.1). One channel can hold "year" but not "coverage by year", so plain (d) loses fractional coverage; it needs (e) to be area-true.
- (e) Better idea: year-encoded blue-noise dither. Threshold the cumulative fractional coverage against a fixed, seeded blue-noise map; a cell lights in the first year its cumulative coverage exceeds its threshold. Because coverage only grows, a lit cell never un-lights, so the whole 76-year film is ONE 8-bit image (byte = year-1900) and age grading falls out of (frame year - byte). Every mark is full strength (sparse logging shows as isolated dots instead of invisible tints), and the count of marks is area-true. Under linear downsampling it degrades into (a), so it is never worse than (a). It is a dot-density map, the standard honest cartographic answer to "too small to see", and it matches Jen's "■ 10,000 ha" key idiom.

## 4. Prototypes
### 4.1 Regional error of each representation, cumulative 2025 (2010 in brackets). Error vs shapely union truth.

| representation | dense VI | sparse Fort Nelson |
|---|---|---|
| shipped (1024, all_touched) | +337% (+538%) | +1620% (+1358%) |
| 4096 wide, all_touched kept | +182% (+207%) | +314% (+288%) |
| 1024 centre-sampled binary | +3.7% (+2.7%) | -15.1% (-13.9%) |
| (a) fractional alpha, 16x16 supersample | +0.6% (+1.5%) | +1.4% (+1.3%) |
| (a) same, quantized to 8-bit alpha | +0.9% (+1.7%) | +1.8% (+1.7%) |
| (e) blue-noise ordered dither of (a), full-alpha marks | +1.7% (-3.8%) | +13% (+15%) (only ~3 px worth of area: small-number noise) |
| (a) with alpha floor 0.15 on any touched px | +13% (+37%) | +137% (+127%) |
| (c) vector PMTiles as shipped, geometry area at z4 | +45% | +17% |
| z5 | -11% | -12% |
| z6 | -18% | -27% |
| z7 | -15% | -8% |
| z8 | -6% | -3% |
| z9 | -1.7% | -0.7% |
| z10 | +0.2% | -0.0% |
| z11/z12 | +0.7% / +0.9% | - |

Vector numbers: tiles fetched live from opencanopy-v10.pmtiles (scripts/vt_fetch.mjs), filtered as the /map layer filters (dated 1950-2025, cap), unioned and clipped to the box. This is geometry area; actual GPU fill at z4-z6 adds fill-antialias edge and the registry's 1 px outline (not measured; adds, never removes). z4 over-paints because detail-11 snapping inflates sub-unit blocks; z5-z7 under-paints because --drop-densest-as-needed and degenerate-polygon removal drop blocks (--no-tiny-polygon-reduction is set, so the lost area is not re-accumulated).

### 4.2 Province-wide (scripts/province.py, out/province.txt), fractional coverage on the 1024 grid

| | cut 1990 | cut 2010 | cut 2025 | fire 2025 |
|---|---|---|---|---|
| union (= fractional-alpha area, by construction) M ha | 0.096 | 2.829 | 5.788 | 19.110 |
| touched px | 2,164 | 43,846 | 62,259 | 78,429 |
| median coverage of a touched px | 5.9% | 9.0% | 14.8% | 57% |
| share of true area in px <10% covered | 24% | 16% | 8% | 1.5% |
| share of true area in px <25% covered | 67% | 50% | 34% | 5.5% |
| share of true area in px >=50% covered | 6% | 16% | 25% | 85% |
| (e) blue-noise dither, area error | -4.0% | -0.25% | -0.5% | +0.04% |
| alpha floor 0.10 / 0.15 / 0.25 on touched px | 1.44/1.81/2.69x | 1.23/1.45/2.00x | 1.11/1.22/1.52x | 1.02/1.05/1.10x |

Legibility: in 2025 a third of logged area sits in cells under 25% covered; at linear alpha those read as faint tints. Early years are worse (1990: two-thirds). An alpha floor buys visibility by re-introducing over-paint (1.2-2.7x), worst exactly where the record is thin. Dither keeps every mark at full strength and the count of marks area-true (2025: about 12,300 lit px of ~470 ha vs 67,640 painted today).

### 4.3 Resolution sweep, cutblocks 2025 dated (scripts/res4096.py, out/res4096.txt)

| grid | px ground area at 50N | median coverage of touched px | dither area error | dither lit px | 1-channel PNG: fractional alpha / 1-bit dither |
|---|---|---|---|---|---|
| 1024x501 (today) | 494 ha | 14.8% | -0.15% | 12,423 | 82 kB / 12 kB |
| 2048x1002 | 123 ha | 21.9% | +0.26% | 49,880 | 243 kB / 44 kB |
| 4096x2004 | 31 ha (~ one median-to-large block) | 37.5% | -0.04% | 198,951 | 477 kB / 163 kB |

Shipped frames today: 2025.png 152 kB RGBA, 76 cutblock frames 4.9 MB, fire 5.2 MB. At 4096 a pixel is about one cutblock, so fractional alpha becomes legible (median 37%) and the picture holds to ~z7 (about 1 image px per CSS px at z7). 4096 also exceeds the WebGL2 guaranteed MAX_TEXTURE_SIZE (2048); most phones support 4096+, but that is a device risk to state, not a measurement.

### 4.4 Prototype: year-encoded blue-noise dither, all 76 years (scripts/peryear.py + scripts/yearencode.py; out/yearencode.txt, out/peryear_table.npy)
Build: one streaming pass, per-year cumulative 16x16-supersampled coverage on the 1024 grid, dated 1950-2025 FTEN under the cap, undated EXCLUDED. ~15 min wall at nice 15 on a loaded 4-core box (load ~7 from the concurrent build), ~1.7 GB RSS.
- Monotonicity asserted: no cell un-lights between years (assert in yearencode.py passed).
- The whole 1950-2025 film is ONE 1024x501 8-bit PNG: 21,202 bytes (out/proto_year_first_1024.png). Today: 76 frames, 4.9 MB.
- Area, years with >=50k ha cumulative (1988-2025): dither vs dissolved union -4.0% to +2.5%; from 2001 on within -1.25% to -0.14% (2025: -0.51%). Fractional (a) equals the union by construction.
- Union vs scrub table: -1.7% to +15.2%. The +15% (1991) to +2.5% (2000) excess is NOT a rendering error; see 4.5.
- 1990 is the worst dither year (-4.0%, ~200 cells of signal; small-number noise). Within C5's +-15% guard everywhere; the 2% scrub reconciliation fails for 1990-2000 for BOTH (a) and (e) because of 4.5, and for (e) in 2018-2025 by ~0.1-0.3 pt (dither -0.5..-0.8% on top of union -1.7%).

### 4.5 Data finding: 9 dated polygons escape the 2,000 ha cap
The cap tests PLANNED_GROSS_BLOCK_AREA, not geometry. 9 dated polygons have geometric area 2,532-18,561 ha (82,920 ha total) but attribute 0.1-1,000 ha (e.g. 1991: 17,989 ha drawn, attribute 0.1 ha; 2003: 18,561 ha drawn, attribute 10 ha). They are drawn as logging by every picture (overlay and /map) but nearly uncounted by the scrub table, and they explain union > scrub in 1991-2003. They are the same kind of tenure-boundary artefact the 2026-09-02 ruling excluded. Fix (for C5's "area semantics first"): cap on max(attribute, geometric area), in the overlay build, scrub build and /map filter alike. Source: out/cut_rows.npy (year, attr, spherical geometry area).

### 4.6 Visual check (out/sheet_province.png, out/sheet_crop.png; static composites at alpha .85 over #121216, not MapLibre renders)
Shipped 2025 reads as a solid red interior. Fractional alpha reads as a faint dusky wash; the north and the early years nearly vanish. Dither reads as a stipple of full-strength marks with density following logging, and sparse areas still show. Two solid round blobs visible in both prototypes are cap-escape polygons (4.5). My blue-noise mask (high-passed white noise) clumps a little; production should use a proper void-and-cluster mask.

## 5. Recommendation
1. **Year-encoded blue-noise dither (e), built from supersampled coverage, decoded on CPU; vector from z8.** Province error -0.5% (2025), within -1.25%..-0.14% for 2001-2025, -4.0%..+2.5% for 1988-2000 (small-number noise); dense box +1.7%, sparse box +13% (three cells' worth). Whole film = one 21 kB PNG. Marks are full strength, so honest AND visible. Descent: build at 2048 (123 ha cells; ~4x the bytes, est. ~80 kB) so it holds to ~z6.5; crossfade to the /map cutblocks vector (global-state year filter, fill-antialias off, no outline) over z7.5-z8.5, where the vector measures -6% (z8) and <=2% (z9+), erring low. Cost: build script change ~1 day (rasterize in EPSG:3857 directly so there is no resample; per-year cumulative coverage; fixed seeded void-and-cluster mask committed with the build); front end ~1-2 days (decode loop + CanvasSource or updateImage blob, age ramp from the byte); truth-check test decodes every year and compares with the dissolved union (+-2%) and the scrub table. Same for fire (median fire cell is 57% covered, so fire is easy either way).
2. **Fractional-coverage alpha (a), S1-lite exactly as written.** Error +0.6..+1.8% regionally, equal to the union province-wide. Cheapest (small diff to build-year-overlays.py, one run). Honest, but thin logging fades out: a third of 2025's area and two-thirds of 1990's sit in cells under 25% covered. Acceptable fallback; meets C5's +-15% guard.
3. **Vector PMTiles alone (c).** Right at z9+, wrong both ways at z4-z7 (+45% .. -27%), and 30-37 MB of decoded features per low-zoom tile over the coast. Use only as the descent layer.
4. Rejected: higher resolution with all_touched (still 2.8x at 4096); alpha floor (1.1-2.7x, worst where data is thin); density choropleth (paints the all_touched extent again, merely tinted).

**Honesty at province scale, and the disclosure.** A dot is a cell, not a cutblock: at 1024 each mark is ~400-500 ha of ground (494 ha at 50N), placed within about one cell (~2-3 km) of where the logging is; the total painted area equals the logged area. Proposed on-screen line, near the counter: "Each red dot marks a patch of land the size of the logged area near it; dots add up to the hectares shown." Shorter, Jen-key style: "Dots drawn to scale of total area, not block outlines." Copy is Lee's call. With fractional alpha the disclosure is instead "Fainter red = less of the area logged".

**Prerequisites from this investigation.** (i) Cap on max(attribute, geometric area): 9 polygons / 82,920 ha slip the cap today (4.5). (ii) C5's area semantics: scrub is a SUM; the dissolved union is 1.7% lower in 2025 (re-harvest/overlap), so any area-true picture paints slightly less than the caption. That is the understate direction, but the 2% reconciliation needs one definition. (iii) Undated stays out (S1-lite); it is +2.43M ha of paint in 2025 and the whole 1950-1990 picture today.

## 6. Unverified
- No MapLibre render was measured (the sandbox cannot render the map; DECISIONS operating constraint). Display smoothing, fill-antialias and outline effects are estimates. Device MAX_TEXTURE_SIZE (for 2048/4096 images) is unprobed: gate memo leg (b) is still pending.
- Vector error is geometry area of decoded tiles, not rendered pixels, and covers two 50 km boxes only.
- 2048-wide dither was not built. Its size (~80 kB) is extrapolated from the 2025 single-year sweep (4.3); its accuracy is assumed equal to 1024/4096 (measured -0.15% / -0.04% for 2025).
- Truth for the regions is a shapely union of the preprocessed FTEN polygons. The province "union" is a 16x supersample (~100x170 m cells, centre-sampled): within 0.6-1.4% of the shapely union in both boxes.
- The intro spike's spliced VRI+FTEN frames (Ted, intro-spike worktree) were not inspected. If they come from the same script they carry the same all_touched over-paint; VRI harvest polygons are larger, so the factor is likely lower, like fire's 2.15x. Unverified.
- Fire was decomposed (2.15x, all from all_touched) but not dither-prototyped per year. Its 2025 province dither error is +0.04% (4.2).
