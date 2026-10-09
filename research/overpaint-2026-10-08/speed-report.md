# Intro film overlay delivery: SPEED report (2026-10-08)

## 1. Context read
- DECISIONS (canopy `.claude/DECISIONS.md`): film 1900-2025, 1900-1959 condensed "in a few seconds", even pacing per year from 1960 (l.61); interim splice VRI to 1999 + FTEN from 2000 (l.44); film clock waits for each frame to paint (l.59); decode-shader pin: "The GFW decode-shader endgame stays behind the pre-committed scroll-story Phase-3 gate" (l.74-77); R2 serves no CORS to localhost (l.84); deploys git-triggered, human-in-loop (l.95-98).
- Jen spec (`.claude/plans/audit-remediation-2026-10/x-intro-jen-spec.md`): clocks 400 ms per cutblock year, 700 ms per fire year, film time advances only after a frame paints (l.47); a **CPU canvas pre-pass over the PNGs, once per frame at load** is already specified as the sanctioned not-a-shader path (l.129); risk l.201: hero 584 KB + MapLibre + style + beat-1 tiles use most of the 2 MB budget; 1990-2025 frames 3.57 MB stream after first scroll; throttled phone 37-42 s to first tile.
- Plan (`glowing-dazzling-brooks.md`): landing under 2 MB before interaction vs 17.6 MB today (l.891); C1: content-versioned paths for `/raster` etc., long cache only on versioned paths, unversioned keep must-revalidate, keep previous two versions (l.119-130); S2 item 8: prefetch a window of frames instead of all 185 (l.964-972).
- Throttled profile (perf audit `verify/performance.md:59,93`, `verify/performance-evidence/scripts/landing-probe.mjs:26-27`): **Slow 4G = 562.5 ms RTT, 1,474.56 kbps down (188,744 B/s), 675 kbps up, + 4x CPU**, phone 390x844@3. All estimates below use this profile ("audit Slow 4G").
- Runtime today: `src/lib/story/setup-layers.ts:20-26` same-origin URL patterns, MapLibre `image` sources swapped with `updateImage` per year; `src/lib/story/prefetch.ts` fires all 77 cutblock + 109 fire `new Image()` loads at hydration in batches of 10/12 every 30 ms.
## 2. Measured today
### 2.1 Shipped frames (repo `public/raster/`, `python3 meas.py public/raster/cutblocks-by-year public/raster/fire-by-year`)
- cutblocks-by-year: 76 year frames 1950-2025 + forest-base.png = 77 files, **4,897,807 B**. Year frames are **RGBA truecolor 1024x501** (not paletted), 29,092 B (1950) rising to 155,872 B (2025): they are **cumulative**, so every frame re-sends every earlier pixel. forest-base.png is paletted (P) 2048x1003, 120,222 B.
- fire-by-year: 109 frames 1917-2025, RGBA truecolor 768x376, **5,211,910 B**, 1,224-69,624 B.
- Live check: `curl -sI https://opencanopy.ca/raster/cutblocks-by-year/2025.png` -> content-length 155872 (matches repo), `cache-control: public,max-age=0,must-revalidate`, etag, no content-encoding (PNG). Same header on fire-by-year/2025.png and forest-base.png. netlify.toml has no `/raster/*` rule (only `/_next/static/*` immutable, `/data/*` 1 day). So **every repeat visit revalidates every frame** (one conditional request each).
### 2.2 What the film actually needs (Ted's spike, read-only: `intro-spike/public/raster/`, untracked, snapshot 06:50 2026-10-08)
- vri-harvest-by-year 1900-2025: 126 files, 6,818,427 B, RGBA 1024x501, cumulative (2,197 B in 1900 -> 143,618 B in 2005).
- cutblocks-dated-by-year 2000-2025: 26 files, 2,164,093 B, RGBA 1024x501, cumulative.
- fire-since-2017-by-year: 9 files, 157,393 B.
- Film set (splice: VRI 1900-1999 + FTEN 2000-2025 + fire 2017-2025 + forest base): VRI 1900-1959 309,407 B; VRI 1960-1999 2,955,882 B; FTEN 2,164,093 B; fire 157,393 B; base 120,222 B = **5,707,000 B in 137 requests**. Jen's "1990-2025 = 3.57 MB" reproduces as 3,433,920 B on this snapshot (VRI 1990-1999 + FTEN 2000-2025).
- Frames actually needed by a beat-paced film: 1960-2025 = 66 frames at 400 ms (beat 4, ~27 s; beat sheet l.19 "19-46 s"); 1900-1959 condensed into ~5 s (beat sheet l.18 "14-19 s") which at 400 ms/frame shows at most ~12 frames, so ~10-12 (every 5 yr) suffice instead of 60; fire 9. Total distinct pictures on screen: **~87**, versus 137 shipped by the spike and 186 by the live story.

## 3. Prototypes
### 3.1 Prototype method (scratch only, nothing in the repo touched)
- `firstyear.py`: rasterizes the source ndjson (`~/Projects/opencanopy/data/checkpoint/preprocessed/`) at **8x supersample** (8192x4008) on the exact build-year-overlays.py grid (BC_BOUNDS, 1024x501, nearest Mercator row remap), storing each subpixel's FIRST year (union semantics: a stand burned or cut twice counts once). Per output pixel, cumulative coverage at year Y = share of its 64 subpixels with first-year <= Y, i.e. a 65-level **area-true alpha** per year. This is a stand-in for the accuracy agent's product, good enough to measure compressibility; it is not their algorithm.
- `encode.py`: from that, encodes (a) cumulative per-year coverage frames, (b) per-year delta frames (coverage added that year), (c) all deltas in ONE atlas image (8 columns), (d) a sparse event stream (varint pixel gaps + coverage byte, brotli q11) as the lower bound, (e) a 2-channel "first year + final coverage" single image (a step approximation, NOT area-true per year). L65 = full 65 levels; L17 = coverage quantized to 17 levels (6.25% steps).
- Fire 2017-2025 (`nice -n 15 python3 firstyear.py fire17 ... FIRE_YEAR int 2017 2025 0 8`; `encode.py fire17 ... 2017 9`, results `proto/fire17-encode.json`):

| Fire 2017-2025, 9 years | bytes | requests |
|---|---|---|
| Spike today (binary, RGBA cumulative PNG) | 157,393 | 9 |
| Area-true cumulative, grey PNG | 172,783 | 9 |
| Area-true cumulative, lossless WebP | 113,610 | 9 |
| Area-true deltas, lossless WebP files | 30,900 | 9 |
| **Area-true delta atlas, one lossless WebP** (round-trip exact) | **31,004** | **1** |
| Same, 17 levels | 22,466 | 1 |
| Sparse events + brotli (lower bound) | 26,894 | 1 |
| First-year + final coverage, one WebP (step approx, overstates area by 3.5% averaged over years) | 29,720 | 1 |
| AVIF lossless (PIL, L->RGB) | 31,021, **not bit-exact** on round trip | 1 |

  Reading: area-true does not cost bytes; **cumulative encoding does**. Deltas are ~5x smaller than cumulative frames because every pixel is sent once, not once per remaining year. AVIF buys nothing over lossless WebP here and was not exact, so it is out (it would also corrupt coverage values silently).
- FTEN dated cutblocks 2000-2025 under the 2,000 ha cap (`firstyear.py ften ... DISTURBANCE_START_DATE date 2000 2025 2000 8`: 168,945 features; `encode.py ften ... 2000 26`, results `proto/ften-encode.json`):

| FTEN 2000-2025, 26 years | bytes | requests |
|---|---|---|
| Spike today (binary RGBA cumulative PNG, `intro-spike/public/raster/cutblocks-dated-by-year`) | 2,164,093 | 26 |
| Area-true cumulative, grey PNG | 1,262,569 | 26 |
| Area-true cumulative, lossless WebP | 848,010 | 26 |
| Area-true deltas, lossless WebP files | 188,132 | 26 |
| **Area-true delta atlas, one lossless WebP** (exact) | **182,992** | **1** |
| Same, 17 levels | 121,094 | 1 |
| Sparse events + brotli (lower bound) | 144,121 | 1 |
| First-year + final coverage, one WebP | 79,412, but **overstates area by 66.7%** averaged over years (pixels accrue over many years) -> rejected | 1 |

  Coverage check: area-true coverage sums to 10,885 pixel-equivalents in 2025 against 54,063 pixels any-touched, the same ~5x over-paint the accuracy lane is chasing. The delta atlas is **11.8x smaller than today's FTEN frames** and one request instead of 26.
- Binary-frame deltas from the spike's own frames (`binframes.py`, read-only on `intro-spike/public/raster`): VRI 1900-1999: cumulative masks are monotone (0 non-monotone px); first-year single image 44,436 B WebP; **delta atlas 68,672 B** vs 3,265,289 B today; cumulative grey WebP files 348,900 B. VRI 2000-2025 adds **zero new pixels** at 1024 px (painted px 56,095 both ways). FTEN 2000-2025 binary: delta atlas 57,354 B; cumulative grey WebP 255,808 B (vs 2,164,093 B RGBA today, an 8.5x cut from format alone).
- VRI area-true is NOT measured (source `vri-raw.ndjson` is the heavy one and Ted is using the box). Estimate: binary VRI deltas x the FTEN area-true/binary ratio (182,992 / 57,354 = 3.19) = **~219 KB**. Unverified.
- Forest base: shipped 2048 paletted PNG 120,222 B; 2048 grey lossless WebP 76,170 B; 1-bit PNG 80,793 B; 1024 box-filtered coverage WebP 50,794 B.
- Sparse event stream (`sparse.py`; per year: uint32 count, LEB128 pixel gaps, coverage byte): fire 2017-2025 gzip -9 **30,703 B** (brotli 26,882); FTEN 2000-2025 gzip -9 **175,160 B** (brotli 144,240). gzip is what `DecompressionStream('gzip')` decodes natively; brotli needs Netlify to brotli-encode the response, which it does for JS (`curl -sI -H 'Accept-Encoding: br' https://opencanopy.ca/tracker.js` -> `content-encoding: br`) but is unverified for a binary type.

### 3.2 Browser test on the audit's profile (Chromium headless via repo Playwright, CDP 562.5 ms / 1,474.56 kbps + 4x CPU, phone 390x844@3; `node runtest.mjs http://127.0.0.1:8765/test.html 1`, page `proto/web/test.html`, local http.server)
- Both paths decode **bit-exact** (per-year coverage sums match the encoder's manifest) in Chromium: grey WebP read back through `createImageBitmap(..., {colorSpaceConversion:'none', premultiplyAlpha:'none'})` + OffscreenCanvas, and the gz event stream through `DecompressionStream`.
- FTEN area-true, 26 delta WebPs (186,638 B): all fetched+decoded in **3.29 s**; per-year accumulate + recolour + putImageData mean 9 ms, max 33 ms.
- FTEN area-true, one gz event stream (175,160 B): **1.51 s**; per-year accumulate+paint mean 2 ms, max 5 ms. Fire: WebP 1.29 s, gz 0.74 s.
- Today's FTEN frames for comparison (`today.html`, 26 cumulative RGBA PNGs, 2,164,093 B, fetched together as prefetch.ts does): 2000 at 0.87 s, 2012 at 4.84 s, **2025 at 12.16 s**. Beat 4 plays those 26 years in 26 x 0.41 = 10.7 s, so even with the link to itself and fetching from the segment's start it under-runs.
- Unthrottled the whole test ran in 0.54 s.

## 4. Options evaluated
Bandwidth demand is the crux. Today beat 4 consumes VRI 1960-1999 at 2,955,882 B / (40 x 0.41 s) = **180 KB/s** and FTEN 2000-2025 at 2,164,093 B / (26 x 0.41 s) = **203 KB/s**, against a link of 188.7 KB/s: 95-108% of the whole pipe, before MapLibre, basemap or terrain take a byte. Cumulative frames make bytes grow with the square of the year count; deltas make bytes proportional to what was actually logged.

Stall model (`model.py`, `model2.py`; film clock from the beat sheet: beat 3 at 14 s, 12 condensed frames, beat 4 at 0.41 s/yr, fire 0.7 s/yr; clock waits on late frames). "Compete" = basemap/terrain bytes for beats 1-2 (unmeasured; the audit saw 2.25 MB of terrain on one province view):
- Today's film set, 88 frames, 5,465,053 B (forest base + 12 condensed VRI + VRI 1960-1999 + FTEN + fire): wire time 29.0 s. Fetched all at once like prefetch.ts: stalls begin at **0.67 MB** of competing load; at 3 MB, 26 stalls and **12.4 s** of added film time; at 6 MB, 28.3 s. Fetched strictly in need-order it tolerates 2.42 MB, and still 3.1 s of stall at 3 MB.
- Area-true deltas, 10 requests, ~553 KB (VRI estimated): wire time ~2.9 s; no stall in either mode up to the competing load that fits in the 14 s before beat 3 (~2.4 MB in need-order). Beat 4's demand falls to ~13 KB/s (~7% of the link).

| Option | Film bytes | Requests | Area-true alpha? | Per-year signal? | Verdict |
|---|---|---|---|---|---|
| Today: cumulative RGBA truecolor PNG | 5.71 MB | 137 | Yes if frames rebuilt area-true (alpha channel), but cumulative area-true WebP for FTEN alone is 848 KB | Yes | Stalls on Slow 4G |
| (c) Same cumulative frames as grey lossless WebP, colour client-side | binary: VRI 349 KB + FTEN 256 KB; area-true FTEN 848 KB | 137 | Yes (grey = coverage) | Yes | Quick win for the spike (format only), still O(years^2) |
| (a) One year-encoded image (first year + final coverage) | FTEN 79 KB, fire 30 KB | 1 | Final coverage only | **Only as a step**: overstates FTEN area by 66.7% averaged over years, fire 3.5% | Rejected for cutblocks; also the decode-shader idea if decoded on GPU |
| (b) Per-year delta frames, grey lossless WebP, CPU-accumulated | FTEN 188 KB, fire 31 KB, VRI ~219 KB est. | ~1 per year | **Yes, exact** (65 levels) | Yes | Good |
| (b') Deltas in one atlas image | FTEN 183 KB | 1 | Yes | Yes | Bytes no better than separate files; decodes to 8192x2004 RGBA (66 MB) for FTEN and 8192x6513 for VRI, over the ~16.7 M px canvas area limit on iOS Safari (known WebKit limit, unverified on current iOS). Rejected |
| **(g) Sparse event stream, gzip, DecompressionStream** | FTEN 175 KB, fire 31 KB, VRI ~200 KB est. | 1 per dataset or per beat chunk | **Yes, exact** | Yes, plus any recency ramp (age buckets) derived client-side from the same events | **Best**: smallest exact, no canvas readback, 2 ms/frame at 4x CPU |
| (c) AVIF lossless | ~same as WebP | | Not bit-exact through PIL (L->RGB->YUV) | | Rejected: silently corrupts coverage |
| (c) 16-bit tricks (year + coverage pair) | | | | Same step problem as (a) | Rejected |
| (d) Resolution ladder / raster PMTiles pyramid | | +2 RTT (header, directory) ~1.1 s | Can carry alpha | Yes | Not needed: overlays live only at z3.3-4.15 (Jen cameras P/F); BC at z4.0 is 256*2^4*25.5/360 = 290 css px = 870 device px at 3x, so 1024 px is the right single rung. Deltas already send each pixel once, so a 512 rung saves little |
| (e) Vector PMTiles + runtime year filter | multi-MB at province zoom | many | **No** at z3-4: 20 ha blocks are sub-pixel, either dropped by tippecanoe or painted >= 1 px | Yes | Rejected for the film; setFilter every 400 ms re-lays every tile at 4x CPU |
| (f) Scheduling | | | n/a | n/a | See 6 |

## 5. Conflicts with DECISIONS
- **Decode-shader pin (l.74-77)**: the recommendation decodes on the CPU into a canvas, the same class of work as Jen's sanctioned "CPU canvas pre-pass ... (not a WebGL decode shader)" (jen-spec l.129). No custom WebGL shader, so it stays inside the pin. Only the encoder idea is shared, which the pin itself says is fine. A single year-encoded image decoded on the GPU (the GFW technique) WOULD cross the pin, and on this data it is also not area-true per year (66.7% FTEN overstatement), so it loses on both counts.
- **R2 CORS (l.84) / same-origin for WebGL**: CPU readback (`getImageData`) and `fetch` + `DecompressionStream` both need same-origin or CORS. Keep the film assets in Netlify `public/` (as today), never on R2.
- **C1 versioning (plan l.119-130)**: long cache only on content-versioned paths. Today's `/raster/*` is unversioned and served `max-age=0, must-revalidate` (measured), so a repeat visit pays one conditional round trip per frame (137 for the spike set). New assets should land at e.g. `/raster/film/<data-version>/...` with `Cache-Control: public, max-age=31536000, immutable`, keeping the previous two versions (C1 retention). netlify.toml is serialized between S2-pages and T (plan l.221), so the header line belongs to S2-pages.
- **Reproducibility rule (l.36)**: the event stream is built by a script from the ndjson and carries per-year coverage sums; a test can assert them against the splice totals (the `hero-figure.test.ts` pattern).
- "Film clock waits for each frame to paint" is untouched; with ~0.5 MB the waits should not trigger on the audit profile unless beats 1-2 pull more than ~2.4 MB of basemap/terrain.

## 6. Ranked recommendation
1. **Area-true sparse delta event stream, gzip, decoded with `DecompressionStream`, accumulated on the CPU into a MapLibre `canvas` source** (MapLibre 5.21.0 ships `CanvasSource` with `animate:false`; `node_modules/maplibre-gl/dist/maplibre-gl.d.ts:2843`). Chunk by beat: (VRI 1900-1959), (VRI 1960-1999), (FTEN 2000-2025), (fire 2017-2025). Bytes: fire 30,703 + FTEN 175,160 (measured) + VRI ~200-220 K (estimated) + forest base 50,794-76,170 (WebP) = **~0.46-0.50 MB in 4-5 requests, vs 5.71 MB in 137** (11-12x less). Slow 4G: ~2.6 s of wire time for the lot; beat-3 data ready ~1 s after request (0.56 s RTT + ~90 KB); FTEN chunk measured 1.51 s fetched+decoded at 4x CPU; 2-5 ms per frame to accumulate and paint. Carries 65-level coverage per pixel per year exactly; Jen's recency ramp falls out of the same events (coverage added in the last 1/10/25 years = running sums of lagged deltas).
2. **Per-year delta frames as grey lossless WebP** (same data, image container). FTEN 186,638 B / 26 files; measured 3.29 s fetched+decoded on the profile, 9 ms mean per frame. Pick it if a binary format plus a JS varint parser is unwanted; costs ~25 more requests and a canvas readback (exact in Chromium, unverified in Safari).
3. **Stopgap for the spike only, no data change**: re-encode the existing cumulative frames as grey lossless WebP and let Jen's CPU pre-pass colour them (FTEN 2.16 MB -> 256 KB, VRI 1900-1999 3.27 MB -> 349 KB). Still binary, not area-true, still O(years^2), but removes the stall with a re-encode.
- **Scheduling (f)**: start the film fetch at the first scroll, in need-order, `fetch(url, {priority:'high'})` for the next chunk and `'low'` for the rest; drop the hero-time prefetch of all frames (`prefetch.ts`, already S2 item 8). Only if the S2 budget meter shows headroom under 2 MB, load the first chunk + forest base (~65-90 KB) at `requestIdleCallback` after `load`. No service worker: versioned immutable paths do the caching.
- **Build cost**: builder ~0.5 day (the supersampled first-year rasterizer here ran 36 s for fire and ~110 s for FTEN 2000-2025 on a loaded 4-core box; VRI is the heavy input), ideally emitted by the accuracy lane's area-true builder rather than a second pipeline. Client ~1 day: ~60-line decoder (`proto/web/test.html`), accumulator + recolour, canvas-source wiring, tests (per-year sums vs splice totals; a mutation that drops a year must go red). One header rule in netlify.toml under C1.

## 7. Unverified
- VRI 1900-1999 area-true bytes (estimated from a 3.19x binary-to-area-true ratio measured on FTEN).
- Safari/iOS: `DecompressionStream` (Safari 16.4+), grey WebP readback exactness, the iOS canvas area limit. Only Chromium was tested.
- Netlify brotli for a binary content type (would cut FTEN 175 -> 144 KB).
- Competing basemap/terrain bytes during beats 1-2 of the new intro (not measured; model break-even ~2.4 MB).
- MapLibre `canvas` source texture upload per frame at 4x CPU (only 2D putImageData measured, 2-5 ms).
- The 8x supersample is a stand-in for the accuracy lane's method with nearest Mercator rows; its absolute areas are not certified.

## Sources
- Frames: `python3 meas.py public/raster/cutblocks-by-year public/raster/fire-by-year` (repo); spike sums via os.path.getsize on `intro-spike/public/raster/*` (untracked, snapshot 2026-10-08 06:50).
- Headers: `curl -sI https://opencanopy.ca/raster/cutblocks-by-year/2025.png` (also fire-by-year/2025.png, forest-base.png; tracker.js with Accept-Encoding br), 2026-10-08.
- Profile: `/home/leesalo/marvin/research/opencanopy-ui-perf-audit-20261001/verify/performance.md:59,93`, `verify/performance-evidence/scripts/landing-probe.mjs:26-27`.
- This directory: `firstyear.py`, `encode.py`, `binframes.py`, `sparse.py`, `model.py`, `model2.py`, `cfg_delta.json`, `runtest.mjs`, `proto/web/test.html`, `proto/web/today.html`, `proto/*-encode.json`, `proto/*.events.gz`.
